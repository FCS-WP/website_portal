<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plugin_changelogs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plugin_version_id')->constrained('plugin_versions')->cascadeOnDelete();
            $table->text('content');
            $table->enum('type', ['feature', 'bugfix', 'security', 'breaking', 'other'])->default('other');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plugin_changelogs');
    }
};
