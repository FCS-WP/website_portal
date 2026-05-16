<?php

namespace App\Services;

use ZipArchive;
use Illuminate\Http\UploadedFile;

class PluginPackageService
{
    /**
     * Validate that the uploaded zip contains a valid WordPress plugin structure.
     * Looks for a main PHP file with a "Plugin Name:" header.
     *
     * @return array{valid: bool, message?: string, plugin_name?: string, plugin_version?: string}
     */
    public static function validate(UploadedFile $file): array
    {
        $zip = new ZipArchive();
        $result = $zip->open($file->getPathname());

        if ($result !== true) {
            return ['valid' => false, 'message' => 'Unable to open zip file.'];
        }

        $pluginName = null;
        $pluginVersion = null;

        // Look for the main PHP file with WordPress plugin header
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $filename = $zip->getNameIndex($i);

            // Skip directories
            if (str_ends_with($filename, '/')) continue;

            // Only check PHP files
            if (!str_ends_with($filename, '.php')) continue;

            $content = $zip->getFromIndex($i);
            if ($content === false) continue;

            // Look for WordPress plugin header
            if (preg_match('/Plugin Name:\s*(.+)/i', $content, $nameMatch)) {
                $pluginName = trim($nameMatch[1]);

                if (preg_match('/Version:\s*(.+)/i', $content, $versionMatch)) {
                    $pluginVersion = trim($versionMatch[1]);
                }
                break;
            }
        }

        $zip->close();

        if (!$pluginName) {
            return ['valid' => false, 'message' => 'No valid WordPress plugin header found in the zip file. Expected a PHP file with "Plugin Name:" header.'];
        }

        return [
            'valid' => true,
            'plugin_name' => $pluginName,
            'plugin_version' => $pluginVersion,
        ];
    }
}
