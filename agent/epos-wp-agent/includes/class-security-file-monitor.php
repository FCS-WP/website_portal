<?php
/**
 * File Integrity Monitoring for EPOS Agent
 * Monitors core files for unauthorized changes and suspicious PHP uploads
 */

if (!defined('ABSPATH')) exit;

class Epos_Agent_Security_File_Monitor {

    /**
     * Default monitored paths and patterns
     */
    private static $default_paths = [
        'wp-content/uploads/' => ['*.php', '*.phtml'],
        'wp-config.php'       => true,
        '.htaccess'           => true,
        'index.php'           => true,
        'wp-login.php'        => true,
        'wp-includes/'        => true,
    ];

    /**
     * Whitelisted extensions (skip these)
     */
    private static $whitelist_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'mp4', 'zip', 'svg'];

    /**
     * Whitelisted directories
     */
    private static $whitelist_dirs = ['wp-content/cache/'];

    /**
     * Create a file integrity baseline
     *
     * @return array
     */
    public static function create_baseline() {
        $base_path = ABSPATH;
        $baseline = [];

        foreach (self::$default_paths as $path => $patterns) {
            $full_path = $base_path . $path;

            if (is_file($full_path)) {
                $relative = $path;
                if (!self::is_whitelisted($relative)) {
                    $baseline[$relative] = hash_file('sha256', $full_path);
                }
            } elseif (is_dir($full_path)) {
                $files = self::scan_directory($full_path, is_array($patterns) ? $patterns : null);
                foreach ($files as $file_path => $hash) {
                    $relative = str_replace($base_path, '', $file_path);
                    if (!self::is_whitelisted($relative)) {
                        $baseline[$relative] = $hash;
                    }
                }
            }
        }

        update_option('epos_agent_file_baseline', $baseline, false);

        // Report baseline to Portal
        $portal_url = get_option('epos_agent_portal_url', '');
        $api_key = get_option('epos_agent_api_key', '');

        if (!empty($portal_url) && !empty($api_key)) {
            wp_remote_post(rtrim($portal_url, '/') . '/api/agent/security/baseline', [
                'timeout' => 30,
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-Agent-Key'  => $api_key,
                    'X-Site-Url'   => get_site_url(),
                ],
                'body' => wp_json_encode([
                    'file_count' => count($baseline),
                    'created_at' => time(),
                ]),
            ]);
        }

        return ['file_count' => count($baseline), 'status' => 'success'];
    }

    /**
     * Run a file integrity scan against the baseline
     *
     * @return array
     */
    public static function run_scan() {
        $baseline = get_option('epos_agent_file_baseline', []);

        if (empty($baseline)) {
            return ['findings_count' => 0, 'error' => 'No baseline exists. Create one first.'];
        }

        $base_path = ABSPATH;
        $current = [];

        foreach (self::$default_paths as $path => $patterns) {
            $full_path = $base_path . $path;

            if (is_file($full_path)) {
                $relative = $path;
                if (!self::is_whitelisted($relative)) {
                    $current[$relative] = hash_file('sha256', $full_path);
                }
            } elseif (is_dir($full_path)) {
                $files = self::scan_directory($full_path, is_array($patterns) ? $patterns : null);
                foreach ($files as $file_path => $hash) {
                    $relative = str_replace($base_path, '', $file_path);
                    if (!self::is_whitelisted($relative)) {
                        $current[$relative] = $hash;
                    }
                }
            }
        }

        $findings = [];

        // Check for modified and deleted files
        foreach ($baseline as $path => $hash) {
            if (!isset($current[$path])) {
                $findings[] = [
                    'path'        => $path,
                    'change_type' => 'deleted',
                    'severity'    => self::classify_severity($path, 'deleted'),
                ];
            } elseif ($current[$path] !== $hash) {
                $findings[] = [
                    'path'        => $path,
                    'change_type' => 'modified',
                    'severity'    => self::classify_severity($path, 'modified'),
                    'new_hash'    => $current[$path],
                ];
            }
        }

        // Check for added files
        foreach ($current as $path => $hash) {
            if (!isset($baseline[$path])) {
                $findings[] = [
                    'path'        => $path,
                    'change_type' => 'added',
                    'severity'    => self::classify_severity($path, 'added'),
                    'hash'        => $hash,
                ];
            }
        }

        // Report findings to Portal
        if (!empty($findings)) {
            $portal_url = get_option('epos_agent_portal_url', '');
            $api_key = get_option('epos_agent_api_key', '');

            if (!empty($portal_url) && !empty($api_key)) {
                wp_remote_post(rtrim($portal_url, '/') . '/api/agent/security/file-report', [
                    'timeout' => 30,
                    'headers' => [
                        'Content-Type' => 'application/json',
                        'X-Agent-Key'  => $api_key,
                        'X-Site-Url'   => get_site_url(),
                    ],
                    'body' => wp_json_encode([
                        'findings'       => $findings,
                        'findings_count' => count($findings),
                        'scanned_at'     => time(),
                    ]),
                ]);
            }
        }

        return ['findings_count' => count($findings), 'findings' => $findings];
    }

    /**
     * Get file content (base64 encoded) with security validation
     *
     * @param string $path Relative path within ABSPATH
     * @return array|WP_Error
     */
    public static function get_file_content($path) {
        // Security: validate path is within ABSPATH
        $full_path = realpath(ABSPATH . $path);

        if ($full_path === false || strpos($full_path, realpath(ABSPATH)) !== 0) {
            return new WP_Error('invalid_path', 'Path is outside WordPress root');
        }

        if (!is_file($full_path) || !is_readable($full_path)) {
            return new WP_Error('not_readable', 'File does not exist or is not readable');
        }

        return [
            'path'          => $path,
            'content'       => base64_encode(file_get_contents($full_path)),
            'file_size'     => filesize($full_path),
            'last_modified' => filemtime($full_path),
        ];
    }

    /**
     * Recursively scan a directory for files
     *
     * @param string     $base_path Full directory path
     * @param array|null $patterns  Glob patterns to match (null = all files)
     * @return array ['full_path' => 'sha256_hash']
     */
    private static function scan_directory($base_path, $patterns = null) {
        $results = [];

        if (!is_dir($base_path)) {
            return $results;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($base_path, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $file) {
            if (!$file->isFile()) continue;

            $file_path = $file->getPathname();
            $relative = str_replace(ABSPATH, '', $file_path);

            // Skip whitelisted
            if (self::is_whitelisted($relative)) continue;

            // If patterns specified, only include matching files
            if ($patterns !== null) {
                $matched = false;
                foreach ($patterns as $pattern) {
                    if (fnmatch($pattern, $file->getFilename())) {
                        $matched = true;
                        break;
                    }
                }
                if (!$matched) continue;
            }

            $results[$file_path] = hash_file('sha256', $file_path);
        }

        return $results;
    }

    /**
     * Classify severity based on file path and change type
     *
     * @param string $file_path   Relative file path
     * @param string $change_type added|modified|deleted
     * @return string CRITICAL|HIGH|MEDIUM|LOW
     */
    private static function classify_severity($file_path, $change_type) {
        // PHP in uploads → CRITICAL
        if (strpos($file_path, 'wp-content/uploads/') === 0) {
            $ext = pathinfo($file_path, PATHINFO_EXTENSION);
            if (in_array(strtolower($ext), ['php', 'phtml'])) {
                return 'CRITICAL';
            }
        }

        // wp-config.php modified → HIGH
        if (basename($file_path) === 'wp-config.php' && $change_type === 'modified') {
            return 'HIGH';
        }

        // .htaccess modified → HIGH
        if (basename($file_path) === '.htaccess' && $change_type === 'modified') {
            return 'HIGH';
        }

        // wp-login.php modified → HIGH
        if (basename($file_path) === 'wp-login.php' && $change_type === 'modified') {
            return 'HIGH';
        }

        // Core files (wp-includes/) modified → HIGH
        if (strpos($file_path, 'wp-includes/') === 0 && $change_type === 'modified') {
            return 'HIGH';
        }

        // Theme files modified → MEDIUM
        if (strpos($file_path, 'wp-content/themes/') === 0) {
            return 'MEDIUM';
        }

        // File deleted → LOW
        if ($change_type === 'deleted') {
            return 'LOW';
        }

        return 'MEDIUM';
    }

    /**
     * Check if a file path is whitelisted
     *
     * @param string $file_path Relative file path
     * @return bool
     */
    private static function is_whitelisted($file_path) {
        // Check whitelisted directories
        foreach (self::$whitelist_dirs as $dir) {
            if (strpos($file_path, $dir) === 0) {
                return true;
            }
        }

        // Check whitelisted extensions
        $ext = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));
        if (in_array($ext, self::$whitelist_extensions)) {
            return true;
        }

        return false;
    }
}
