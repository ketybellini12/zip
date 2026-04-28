import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { users, billing, transactions } from '@/db/schema';
import { eq } from 'drizzle-orm';

const env = getEnv();
const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature || !webhookSecret) {
      logger.error('Stripe webhook: missing signature or secret');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    
    let event: Stripe.Event;
    
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed', err as Error);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    
    logger.info('Stripe webhook received', { type: event.type, id: event.id });
    
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription, event.type);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      
      case 'customer.deleted': {
        const customer = event.data.object as Stripe.Customer;
        await handleCustomerDeleted(customer);
        break;
      }
      
      default:
        logger.debug('Unhandled Stripe event type', { type: event.type });
    }
    
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error) {
    logger.error('Stripe webhook handler error', error as Error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    logger.warn('Checkout session missing userId', { sessionId: session.id });
    return;
  }
  
  await db.transaction(async (tx) => {
    // Update user billing status
    await tx.update(billing)
      .set({
        stripeCustomerId: session.customer as string,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(billing.userId, userId));
    
    // Record transaction
    await tx.insert(transactions).values({
      userId,
      type: 'subscription_purchase',
      amount: session.amount_total || 0,
      currency: session.currency || 'usd',
      stripePaymentIntentId: session.payment_intent as string,
      metadata: {
        sessionId: session.id,
        items: session.line_items?.data.map(item => ({
          description: item.description,
          quantity: item.quantity,
          amount: item.amount_total,
        })),
      },
      createdAt: new Date(),
    });
  });
  
  logger.info('Checkout session completed', { userId, sessionId: session.id });
}

async function handleSubscriptionChange(
  subscription: Stripe.Subscription, 
  eventType: string
) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  
  const status = subscription.status;
  const planId = subscription.items.data[0]?.plan.id;
  
  await db.update(billing)
    .set({
      stripeSubscriptionId: subscription.id,
      planId,
      status: status === 'active' ? 'active' : status === 'canceled' ? 'canceled' : 'past_due',
      currentPeriodEnd: subscription.current_period_end 
        ? new Date(subscription.current_period_end * 1000) 
        : null,
      updatedAt: new Date(),
    })
    .where(eq(billing.userId, userId));
  
  logger.info('Subscription updated', { userId, eventType, status });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const userId = invoice.metadata?.userId;
  if (!userId) return;
  
  await tx.insert(transactions).values({
    userId,
    type: 'subscription_renewal',
    amount: invoice.amount_paid || 0,
    currency: invoice.currency || 'usd',
    stripePaymentIntentId: invoice.payment_intent as string,
    metadata: { invoiceId: invoice.id },
    createdAt: new Date(),
  });
  
  logger.info('Payment succeeded', { userId, invoiceId: invoice.id });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const userId = invoice.metadata?.userId;
  if (!userId) return;
  
  // Notify user of payment failure (implement email/notification service)
  logger.warn('Payment failed', { userId, invoiceId: invoice.id, reason: invoice.last_payment_error?.message });
}

async function handleCustomerDeleted(customer: Stripe.Customer) {
  const userId = customer.metadata?.userId;
  if (!userId) return;
  
  await db.update(billing)
    .set({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: 'canceled',
      updatedAt: new Date(),
    })
    .where(eq(billing.userId, userId));
  
  logger.info('Customer deleted', { userId, stripeCustomerId: customer.id });
}

export const config = {
  api: {
    bodyParser: false, // Stripe needs raw body for signature verification
  },
};