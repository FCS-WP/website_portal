<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(\App\Services\CredentialEncryptionService::class);
        $this->app->singleton(\App\Services\VaultAuditService::class);
        $this->app->singleton(\App\Services\PortalMailConfigService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Apply portal-wide SMTP settings stored in PortalSetting onto
        // config('mail.*') so outgoing portal mail uses the admin-configured
        // server instead of static .env values.
        app(\App\Services\PortalMailConfigService::class)->apply();
    }
}
