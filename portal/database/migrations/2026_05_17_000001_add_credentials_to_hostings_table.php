<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hostings', function (Blueprint $table) {
            $table->string('ip_address')->nullable()->after('note');
            $table->string('username')->nullable()->after('ip_address');
            $table->text('password_encrypted')->nullable()->after('username');
            $table->string('panel_url')->nullable()->after('password_encrypted');
        });
    }

    public function down(): void
    {
        Schema::table('hostings', function (Blueprint $table) {
            $table->dropColumn(['ip_address', 'username', 'password_encrypted', 'panel_url']);
        });
    }
};
