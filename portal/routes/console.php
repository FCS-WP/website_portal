<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('sites:ping')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('deployments:dispatch-scheduled')->everyMinute();
Schedule::command('security:sync-vulnerabilities')->dailyAt('02:00');
Schedule::command('security:scan-file-integrity')->dailyAt('03:00');
Schedule::command('security:scan-vulnerabilities')->dailyAt('04:00');
Schedule::command('security:calculate-scores')->everySixHours();
Schedule::command('security:prune-login-events')->weekly();
Schedule::command('plugins:sync-wporg-cache')->dailyAt('01:00');

// Daily DB + private storage backup. Writes to ./backups/<date>/, prunes
// dirs older than 14 days. Restore via `make restore DATE=YYYY-MM-DD`.
Schedule::command('db:backup')->dailyAt('03:30')->withoutOverlapping();
