<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('sites:ping')->everyFiveMinutes();
Schedule::command('sites:check-health')->everyFiveMinutes();
Schedule::command('deployments:dispatch-scheduled')->everyMinute();
Schedule::command('security:sync-vulnerabilities')->dailyAt('02:00');
Schedule::command('security:scan-file-integrity')->dailyAt('03:00');
Schedule::command('security:scan-vulnerabilities')->dailyAt('04:00');
Schedule::command('security:calculate-scores')->everySixHours();
Schedule::command('security:prune-login-events')->weekly();
