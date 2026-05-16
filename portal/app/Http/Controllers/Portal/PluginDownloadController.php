<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Services\SignedUrlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PluginDownloadController extends Controller
{
    /**
     * GET /api/plugin-downloads/{token}
     * Serve the plugin zip file if token is valid.
     */
    public function download(string $token)
    {
        $data = SignedUrlService::validateToken($token);

        if (!$data) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or expired download link.',
            ], 403);
        }

        $filePath = $data['file_path'];

        if (!Storage::disk('local')->exists($filePath)) {
            return response()->json([
                'success' => false,
                'message' => 'File not found.',
            ], 404);
        }

        $fullPath = Storage::disk('local')->path($filePath);
        $fileName = basename($filePath);

        return response()->download($fullPath, $fileName, [
            'Content-Type' => 'application/zip',
            'X-File-Hash' => $data['file_hash'],
        ]);
    }
}
