import Stripe from 'stripe';
import { sb } from './supabase.js';
import 'dotenv/config';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  starter:    process.env.STRIPE_PRICE_STARTER,
  pro:        process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export async function createCheckoutSession(tenantId, plan, successUrl, cancelUrl) {
  const priceId = PRICE_MAP[plan];
  if (!priceId) throw new Error(`Plano inválido: ${plan}`);

  // Get or create Stripe customer
  const { data: sub } = await sb.from('subscriptions')
    .select('stripe_customer_id').eq('tenant_id', tenantId).maybeSingle();

  let customerId = sub?.stripe_customer_id;
  if (!customerId) {
    const { data: tenant } = await sb.from('tenants')
      .select('name').eq('id', tenantId).single();
    const customer = await stripe.customers.create({ name: tenant?.name, metadata: { tenant_id: tenantId } });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenant_id: tenantId, plan },
  });

  return session;
}

export async function createPortalSession(tenantId, returnUrl) {
  const { data: sub } = await sb.from('subscriptions')
    .select('stripe_customer_id').eq('tenant_id', tenantId).single();
  if (!sub?.stripe_customer_id) throw new Error('Cliente Stripe não encontrado.');

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });
  return session;
}

export async function handleWebhook(rawBody, signature) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw new Error(`Webhook inválido: ${err.message}`);
  }

  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const tenantId = obj.metadata.tenant_id;
      const plan     = obj.metadata.plan;
      await sb.from('subscriptions').upsert({
        tenant_id:          tenantId,
        stripe_customer_id: obj.customer,
        stripe_price_id:    obj.subscription,
        plan,
        status: 'active',
        started_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
      await sb.from('tenants').update({ plan }).eq('id', tenantId);
      break;
    }
    case 'customer.subscription.updated': {
      const tenantId = obj.metadata?.tenant_id;
      if (!tenantId) break;
      const status = obj.status === 'active' ? 'active'
        : obj.status === 'canceled' ? 'canceled'
        : obj.status === 'past_due' ? 'past_due' : obj.status;
      await sb.from('subscriptions').update({
        status,
        cancel_at_period_end: obj.cancel_at_period_end,
        expires_at: obj.current_period_end
          ? new Date(obj.current_period_end * 1000).toISOString() : null,
      }).eq('tenant_id', tenantId);
      if (status === 'canceled') {
        await sb.from('tenants').update({ plan: 'free' }).eq('id', tenantId);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const tenantId = obj.metadata?.tenant_id;
      if (tenantId) {
        await sb.from('subscriptions').update({ status: 'canceled' }).eq('tenant_id', tenantId);
        await sb.from('tenants').update({ plan: 'free' }).eq('id', tenantId);
      }
      break;
    }
  }
  return event.type;
}
