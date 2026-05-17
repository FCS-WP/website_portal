<?php

namespace App\Traits;

use App\Models\Site;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

/**
 * Site-scope authorization helper.
 *
 * Centralises the "can this user touch this site" check that's needed on
 * every per-site write endpoint. Admin gets a pass via Site::accessibleBy;
 * dev/mkt have to be in the site_users pivot.
 *
 * Use it from a controller:
 *
 *     use AuthorizesSiteAccess;
 *
 *     public function update(Request $request, Site $site) {
 *         $this->assertSiteAccess($request, $site);
 *         // ... rest of the handler
 *     }
 *
 * Throws an HttpResponseException with a JSON 403 body so it short-circuits
 * the controller and matches the shape every other 403 in the app returns.
 */
trait AuthorizesSiteAccess
{
    /**
     * Stop the request with a 403 if the caller isn't allowed to act on $site.
     *
     * @throws HttpResponseException
     */
    protected function assertSiteAccess(Request $request, Site $site): void
    {
        $user = $request->user();
        if (!$user) {
            throw new HttpResponseException(response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
            ], 401));
        }

        $hasAccess = Site::accessibleBy($user)->whereKey($site->id)->exists();
        if (!$hasAccess) {
            throw new HttpResponseException(response()->json([
                'success' => false,
                'message' => 'You do not have access to this site.',
            ], 403));
        }
    }
}
