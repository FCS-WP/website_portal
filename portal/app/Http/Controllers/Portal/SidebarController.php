<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\DeploymentJob;
use App\Models\Hosting;
use App\Models\Plugin;
use App\Models\SecurityAlert;
use App\Models\Site;
use App\Models\SitePlugin;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;

class SidebarController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/sidebar/counts
     * Returns lightweight counts for sidebar badges.
     */
    public function counts(Request $request)
    {
        $user = $request->user();

        $sites = Site::accessibleBy($user)->count();
        $hostings = Hosting::count();

        $pluginUpdates = SitePlugin::whereHas('site', function ($q) use ($user) {
            $q->accessibleBy($user);
        })->where('update_available', true)
            ->distinct('plugin_slug')
            ->count('plugin_slug');

        $plugins = Plugin::count();

        $securityAlerts = SecurityAlert::where('status', 'open')->count();

        $activeDeployments = DeploymentJob::whereIn('status', ['queued', 'running'])->count();

        return $this->successResponse([
            'sites' => $sites,
            'hostings' => $hostings,
            'plugin_updates' => $pluginUpdates,
            'plugins' => $plugins,
            'security_alerts' => $securityAlerts,
            'active_deployments' => $activeDeployments,
        ]);
    }
}
