<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 7 — Module 26 order-spike alert log.
 *
 * One row per fired alert. Used both as an audit trail and to enforce the
 * 60-minute cooldown that prevents alert flooding during sustained traffic.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_spike_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->enum('alert_type', ['hourly_spike', 'burst']);
            $table->integer('order_count');
            $table->integer('threshold');
            $table->integer('window_minutes');
            $table->boolean('telegram_sent')->default(false);
            $table->timestamp('telegram_sent_at')->nullable();
            $table->timestamps();

            $table->index(['site_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_spike_alerts');
    }
};
