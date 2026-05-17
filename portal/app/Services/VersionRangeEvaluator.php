<?php

namespace App\Services;

class VersionRangeEvaluator
{
    /**
     * Check if an installed version is affected by a vulnerability.
     *
     * @param string $installedVersion e.g. "5.7.0"
     * @param mixed $affectedVersions JSON-decoded array of version constraints
     *   Format from Wordfence: {"5.7":{"operator":"<","version":"5.8"}} or
     *   simpler form: [{"operator":"<","version":"5.8"}] or
     *   string form: "< 5.8" or ">= 5.0, < 5.7.1" or "*"
     * @param string|null $fixedInVersion The version that patches the vulnerability
     * @return bool
     */
    public static function isAffected(string $installedVersion, $affectedVersions, ?string $fixedInVersion = null): bool
    {
        // If there's a fixed version and installed >= fixed, not affected
        if ($fixedInVersion && version_compare($installedVersion, $fixedInVersion, '>=')) {
            return false;
        }

        // Handle different formats from Wordfence API
        if (is_string($affectedVersions)) {
            return self::evaluateStringRange($installedVersion, $affectedVersions);
        }

        if (is_array($affectedVersions)) {
            return self::evaluateArrayRange($installedVersion, $affectedVersions);
        }

        // If object/associative array (Wordfence format)
        if (is_object($affectedVersions)) {
            $affectedVersions = (array) $affectedVersions;
        }

        // Wordfence format: { "from_version": { "operator": "<=", "version": "to_version" } }
        foreach ($affectedVersions as $fromVersion => $constraint) {
            if (is_object($constraint)) {
                $constraint = (array) $constraint;
            }
            if (is_array($constraint) && isset($constraint['operator']) && isset($constraint['version'])) {
                // Check from_version condition (installed >= from_version)
                if (is_numeric($fromVersion[0]) && !version_compare($installedVersion, $fromVersion, '>=')) {
                    continue;
                }
                // Check to_version condition
                if (version_compare($installedVersion, $constraint['version'], $constraint['operator'])) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Evaluate a string range like "< 5.8" or ">= 5.0, < 5.7.1" or "*"
     */
    private static function evaluateStringRange(string $installedVersion, string $range): bool
    {
        $range = trim($range);

        // Wildcard = all versions affected
        if ($range === '*') {
            return true;
        }

        // Split by comma for compound ranges
        $conditions = array_map('trim', explode(',', $range));

        foreach ($conditions as $condition) {
            if (!self::evaluateSingleCondition($installedVersion, $condition)) {
                return false; // All conditions must be true (AND logic)
            }
        }

        return true;
    }

    /**
     * Evaluate a single condition like "< 5.8" or ">= 5.0"
     */
    private static function evaluateSingleCondition(string $installedVersion, string $condition): bool
    {
        $condition = trim($condition);

        // Parse operator and version
        if (preg_match('/^([<>!=]+)\s*(.+)$/', $condition, $matches)) {
            $operator = $matches[1];
            $version = trim($matches[2]);
            return version_compare($installedVersion, $version, $operator);
        }

        // If just a version number, treat as exact match
        return version_compare($installedVersion, $condition, '==');
    }

    /**
     * Evaluate array format [{"operator":"<","version":"5.8"}]
     */
    private static function evaluateArrayRange(string $installedVersion, array $ranges): bool
    {
        if (empty($ranges)) {
            return false;
        }

        // Check if it's a flat array of constraint objects
        foreach ($ranges as $key => $constraint) {
            if (is_array($constraint) && isset($constraint['operator']) && isset($constraint['version'])) {
                if (!version_compare($installedVersion, $constraint['version'], $constraint['operator'])) {
                    return false;
                }
            }
        }

        return true;
    }
}
