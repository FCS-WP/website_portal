<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sites', function (Blueprint $table) {
            $table->unsignedSmallInteger('consecutive_ping_failures')->default(0)->after('last_ping_at');
            $table->timestamp('last_disconnect_alert_at')->nullable()->after('consecutive_ping_failures');
        });
    }

    public function down(): void
    {
        Schema::table('sites', function (Blueprint $table) {
            $table->dropColumn(['consecutive_ping_failures', 'last_disconnect_alert_at']);
        });
    }
};
