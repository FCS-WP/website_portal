<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_plugins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->foreignId('plugin_id')->constrained('plugins')->cascadeOnDelete();
            $table->string('installed_version', 50)->nullable();
            $table->string('latest_version', 50)->nullable();
            $table->boolean('is_active')->default(false);
            $table->timestamp('last_synced_at')->nullable();
            $table->unique(['site_id', 'plugin_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_plugins');
    }
};
