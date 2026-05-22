<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_smtp_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('host');
            $table->unsignedSmallInteger('port')->default(587);
            $table->string('username')->nullable();
            // Encrypted via CredentialEncryptionService (AES-256-GCM, VAULT_MASTER_KEY).
            // Stored as base64(iv):base64(tag):base64(ciphertext).
            $table->text('password_encrypted')->nullable();
            $table->string('encryption', 8)->default('tls');
            $table->string('from_email');
            $table->string('from_name');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_pushed_at')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_smtp_settings');
    }
};
