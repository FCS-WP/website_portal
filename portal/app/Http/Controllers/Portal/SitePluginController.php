<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Traits\ApiResponse;

class SitePluginController extends Controller
{
    use ApiResponse;

    public function index(Site $site)
    {
        $plugins = $site->sitePlugins()->with('plugin:id,name,slug,author')->get();

        $data = $plugins->map(function ($sp) {
            return [
                'id' => $sp->id,
                'plugin' => $sp->plugin,
                'installed_version' => $sp->installed_version,
                'latest_version' => $sp->latest_version,
                'is_active' => $sp->is_active,
                'is_outdated' => $sp->isOutdated(),
                'last_synced_at' => $sp->last_synced_at,
            ];
        });

        return $this->successResponse($data);
    }
}
