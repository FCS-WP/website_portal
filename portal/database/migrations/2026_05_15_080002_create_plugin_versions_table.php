<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plugin_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plugin_id')->constrained('plugins')->cascadeOnDelete();
            $table->string('version', 50);
            $table->string('file_path', 500);
            $table->unsignedBigInteger('file_size');
            $table->string('file_hash', 64); // SHA256
            $table->boolean('is_stable')->default(true);
            $table->foreignId('released_by')->constrained('users');
            $table->timestamp('released_at');
            $table->timestamps();
            $table->unique(['plugin_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plugin_versions');
    }
};
