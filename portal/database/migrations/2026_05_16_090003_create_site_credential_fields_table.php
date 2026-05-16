<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_credential_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_credential_id')->constrained('site_credentials')->cascadeOnDelete();
            $table->string('field_key', 100);
            $table->string('field_label', 100);
            $table->text('field_value');
            $table->boolean('is_sensitive')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_credential_fields');
    }
};
