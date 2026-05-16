<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Plugin;
use App\Models\PluginVersion;
use App\Models\PluginChangelog;
use App\Traits\ApiResponse;
use App\Services\PluginPackageService;
use App\Services\SignedUrlService;
use App\Services\ActivityLogService;
use App\Services\TelegramNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PluginVersionController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/plugins/{plugin}/versions
     * List all versions for a plugin.
     */
    public function index(Plugin $plugin)
    {
        $versions = $plugin->versions()
            ->with(['changelog', 'releasedBy:id,name'])
            ->orderBy('released_at', 'desc')
            ->get();

        return $this->successResponse($versions);
    }

    /**
     * POST /api/plugins/{plugin}/versions
     * Upload a new version (multipart form data).
     */
    public function store(Request $request, Plugin $plugin)
    {
        $request->validate([
            'file' => 'required|file|mimes:zip|max:51200', // 50MB
            'version' => 'required|string|max:50|regex:/^\d+\.\d+\.\d+$/',
            'changelog' => 'required|string',
            'type' => 'required|string|in:feature,bugfix,security,breaking,other',
            'is_stable' => 'sometimes|boolean',
        ]);

        // Check version uniqueness for this plugin
        $existingVersion = $plugin->versions()->where('version', $request->version)->exists();
        if ($existingVersion) {
            return $this->errorResponse("Version {$request->version} already exists for this plugin.", 422);
        }

        // Check version is greater than the latest
        $latestVersion = $plugin->versions()->orderBy('released_at', 'desc')->first();
        if ($latestVersion && version_compare($request->version, $latestVersion->version, '<=')) {
            return $this->errorResponse("Version must be greater than the current latest ({$latestVersion->version}).", 422);
        }

        // Validate WordPress plugin structure
        $validation = PluginPackageService::validate($request->file('file'));
        if (!$validation['valid']) {
            return $this->errorResponse($validation['message'], 422);
        }

        // Warn if version mismatch between form and plugin header
        $warnings = [];
        if (!empty($validation['plugin_version']) && $validation['plugin_version'] !== $request->version) {
            $warnings[] = "Note: Version in plugin header ({$validation['plugin_version']}) differs from submitted version ({$request->version}).";
        }

        // Calculate file hash
        $file = $request->file('file');
        $fileHash = hash_file('sha256', $file->getPathname());
        $fileSize = $file->getSize();

        // Store the file
        $storagePath = "plugins/{$plugin->slug}/{$request->version}/{$plugin->slug}.zip";
        Storage::disk('local')->putFileAs(
            "plugins/{$plugin->slug}/{$request->version}",
            $file,
            "{$plugin->slug}.zip"
        );

        // Create version record
        $version = PluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => $request->version,
            'file_path' => $storagePath,
            'file_size' => $fileSize,
            'file_hash' => $fileHash,
            'is_stable' => $request->input('is_stable', true),
            'released_by' => $request->user()->id,
            'released_at' => now(),
        ]);

        // Create changelog
        PluginChangelog::create([
            'plugin_version_id' => $version->id,
            'content' => $request->changelog,
            'type' => $request->type,
        ]);

        // Activity log
        ActivityLogService::log(
            'plugin.version_uploaded',
            $version,
            $request->user(),
            $request->ip(),
            ['plugin_slug' => $plugin->slug, 'version' => $request->version]
        );

        // Telegram notification
        TelegramNotificationService::notifyAdminChannel(
            "📦 New plugin version: *{$plugin->name}* v{$request->version} uploaded by {$request->user()->name}."
        );

        $version->load('changelog');

        $response = $version->toArray();
        if (!empty($warnings)) {
            $response['warnings'] = $warnings;
        }

        return $this->successResponse($response, 'Plugin version uploaded successfully.', 201);
    }

    /**
     * GET /api/plugin-versions/{pluginVersion}/download-url
     * Generate a signed download URL.
     */
    public function downloadUrl(PluginVersion $pluginVersion)
    {
        $downloadInfo = SignedUrlService::generateDownloadUrl($pluginVersion);

        return response()->json([
            'success' => true,
            'data' => $downloadInfo,
        ]);
    }

    /**
     * DELETE /api/plugin-versions/{pluginVersion}
     * Admin only — delete a version.
     */
    public function destroy(Request $request, PluginVersion $pluginVersion)
    {
        if ($request->user()->role !== 'admin') {
            return $this->errorResponse('Only admins can delete plugin versions.', 403);
        }

        // Delete the file from storage
        if (Storage::disk('local')->exists($pluginVersion->file_path)) {
            Storage::disk('local')->delete($pluginVersion->file_path);
        }

        $pluginSlug = $pluginVersion->plugin->slug;
        $versionStr = $pluginVersion->version;

        ActivityLogService::log(
            'plugin.version_deleted',
            $pluginVersion,
            $request->user(),
            $request->ip(),
            ['plugin_slug' => $pluginSlug, 'version' => $versionStr]
        );

        $pluginVersion->delete();

        return $this->successResponse(null, 'Plugin version deleted successfully.');
    }
}
