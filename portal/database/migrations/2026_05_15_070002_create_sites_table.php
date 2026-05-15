<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hosting_id')->nullable()->constrained('hostings')->nullOnDelete();
            $table->string('name');
            $table->string('url', 500)->unique();
            $table->text('description')->nullable();
            $table->string('api_secret_key', 64)->unique(); // stored as SHA256 hash
            $table->enum('status', ['pending', 'connected', 'disconnected'])->default('pending');
            $table->string('wp_version', 20)->nullable();
            $table->string('php_version', 20)->nullable();
            $table->boolean('woo_active')->default(false);
            $table->timestamp('last_ping_at')->nullable();
            $table->json('tags')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sites');
    }
};
