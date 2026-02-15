/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max ms.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomDelay(min = 500, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Extract a numeric LinkedIn job ID from various URL formats.
 * @param {string} url
 * @returns {string|null}
 */
export function extractJobId(url) {
    if (!url) return null;
    // /jobs/view/some-slug-1234567890  or  /jobPosting/1234567890
    const match = url.match(/(\d{8,})/);
    return match ? match[1] : null;
}

/**
 * Extract trackingId and refId from a LinkedIn job URL.
 * @param {string} url
 * @returns {{ trackingId: string|null, refId: string|null }}
 */
export function extractTrackingParams(url) {
    if (!url) return { trackingId: null, refId: null };
    try {
        const parsed = new URL(url, 'https://www.linkedin.com');
        return {
            trackingId: parsed.searchParams.get('trackingId') || null,
            refId: parsed.searchParams.get('refId') || null,
        };
    } catch {
        return { trackingId: null, refId: null };
    }
}

/**
 * Format postedAt to YYYY-MM-DD.
 * @param {string|null} postedAt - ISO date or date string
 * @returns {string|null}
 */
export function formatPostedAt(postedAt) {
    if (!postedAt) return null;
    const date = postedAt.split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : postedAt;
}

/**
 * Normalize a relative or protocol-relative LinkedIn URL.
 * @param {string} url
 * @returns {string}
 */
export function normalizeUrl(url) {
    if (!url) return '';
    url = url.trim();
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `https://www.linkedin.com${url}`;
    if (!url.startsWith('http')) return `https://${url}`;
    return url;
}

/**
 * Extract the LinkedIn company slug from a company URL.
 * e.g. https://www.linkedin.com/company/facebook → "facebook"
 * @param {string} url
 * @returns {string|null}
 */
export function extractCompanySlug(url) {
    if (!url) return null;
    const match = url.match(/linkedin\.com\/company\/([^/?#]+)/);
    return match ? match[1] : null;
}

/**
 * Build a human-readable LinkedIn jobs search URL (for inputUrl in output).
 * @param {string} keywords
 * @param {string} location
 * @param {Object} extraParams - e.g. { f_TPR: 'r604800' }
 * @returns {string}
 */
export function buildHumanSearchUrl(keywords, location, extraParams = {}) {
    const params = new URLSearchParams({
        keywords: keywords || '',
        location: location || '',
        ...extraParams,
    });
    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/**
 * Build a LinkedIn guest job search URL.
 * @param {string} keywords
 * @param {string} location
 * @param {number} start - pagination offset (0, 25, 50...)
 * @param {Object} extraParams - additional URL params (f_TPR, etc.)
 * @returns {string}
 */
export function buildSearchUrl(keywords, location, start = 0, extraParams = {}) {
    const params = new URLSearchParams({
        keywords,
        location: location || '',
        trk: 'public_jobs_jobs-search-bar_search-submit',
        position: '1',
        pageNum: '0',
        start: String(start),
        ...extraParams,
    });
    return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;
}

/**
 * Convert a LinkedIn search page URL to the guest API "seeMoreJobPostings" URL.
 * If already in API format, returns as-is.
 * @param {string} url
 * @returns {string}
 */
export function toGuestApiUrl(url) {
    if (url.includes('/jobs-guest/jobs/api/seeMoreJobPostings/')) return url;

    try {
        const parsed = new URL(url);
        const params = parsed.searchParams;

        // Preserve all query params but change the path
        const apiUrl = new URL('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search');
        for (const [key, value] of params.entries()) {
            apiUrl.searchParams.set(key, value);
        }
        if (!apiUrl.searchParams.has('start')) {
            apiUrl.searchParams.set('start', '0');
        }
        return apiUrl.toString();
    } catch {
        return url;
    }
}

/**
 * Parse the 'start' parameter from a URL for pagination tracking.
 * @param {string} url
 * @returns {number}
 */
export function getStartParam(url) {
    try {
        const parsed = new URL(url);
        return parseInt(parsed.searchParams.get('start') || '0', 10);
    } catch {
        return 0;
    }
}

/**
 * Clone a URL and set its 'start' parameter.
 * @param {string} url
 * @param {number} start
 * @returns {string}
 */
export function setStartParam(url, start) {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set('start', String(start));
        return parsed.toString();
    } catch {
        return url;
    }
}
