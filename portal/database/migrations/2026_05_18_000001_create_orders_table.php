<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 7 — Module 23/24 orders table.
 *
 * Stores up to 200 most recent orders per site (older rows pruned after each
 * sync). Designed for support lookup, not analytics — line items live as JSON
 * on the row rather than a separate table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->unsignedBigInteger('woo_order_id');
            $table->string('order_number', 50)->nullable();
            $table->string('status', 50);
            $table->decimal('total', 15, 2);
            $table->string('currency', 10)->default('USD');

            // Customer
            $table->string('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_phone', 50)->nullable();
            $table->text('billing_address')->nullable();

            // Payment
            $table->string('payment_method', 100)->nullable();
            $table->string('payment_method_title')->nullable();

            // Line items + meta
            $table->json('line_items')->nullable();
            $table->integer('items_count')->default(0);
            $table->text('latest_note')->nullable();

            // Timestamps
            $table->timestamp('order_date');
            $table->timestamp('synced_at');
            $table->timestamps();

            $table->unique(['site_id', 'woo_order_id']);
            $table->index(['site_id', 'order_date']);
            $table->index(['site_id', 'status']);
            $table->index('order_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
