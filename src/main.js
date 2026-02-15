import { Actor, log } from 'apify';
import { CheerioCrawler, RequestQueue } from 'crawlee';
import { COUNTRY_CITIES } from './constants.js';
import { parseJobCards, parseJobDetail, parseCompanyPage, isLoginWall } from './parsers.js';
import {
    sleep, randomDelay, extractJobId, normalizeUrl,
    extractCompanySlug, buildSearchUrl, toGuestApiUrl,
    getStartParam, setStartParam,
} from './utils.js';

// ────────────────────────────────────────────────────────────────
await Actor.init();

const input = await Actor.getInput() ?? {};
const {
    startUrls = [],
    searchKeywords = [],
    searchLocation = '',
    maxItems = 200,
    scrapeCompany = true,
    scrapeJobDetails = true,
    splitSearchByLocation = false,
    targetCountry = '',
    datePosted = '',
    proxy = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
} = input;

// ── Validate ─────────────────────────────────────────────────
const hasStartUrls = startUrls && startUrls.length > 0 && startUrls.some(u => u.url || u);
const hasKeywords = searchKeywords && searchKeywords.length > 0;

if (!hasStartUrls && !hasKeywords) {
    throw new Error(
        'Provide at least one LinkedIn search URL in "startUrls" or keywords in "searchKeywords".',
    );
}

// ── Proxy ────────────────────────────────────────────────────
const proxyConfiguration = await Actor.createProxyConfiguration(proxy);

// ── State ────────────────────────────────────────────────────
const scrapedIds = new Set();
let totalScraped = 0;
const companyCache = new Map();       // slug → company data
const pendingCompanies = new Map();   // slug → [resolve callbacks]

// ── Request Queue ────────────────────────────────────────────
const requestQueue = await RequestQueue.open();

/**
 * Enqueue all paginated search URLs for a single base URL.
 */
async function enqueueSearchPages(baseApiUrl, label = '') {
    const pagesNeeded = Math.ceil(maxItems / 25);
    for (let page = 0; page < pagesNeeded; page++) {
        const url = setStartParam(baseApiUrl, page * 25);
        await requestQueue.addRequest({
            url,
            uniqueKey: url,
            userData: { type: 'SEARCH', label },
        });
    }
}

// ── Build initial search queue ───────────────────────────────
if (hasStartUrls) {
    for (const entry of startUrls) {
        const rawUrl = typeof entry === 'string' ? entry : entry.url;
        if (!rawUrl) continue;

        const apiUrl = toGuestApiUrl(rawUrl);

        if (splitSearchByLocation && targetCountry && COUNTRY_CITIES[targetCountry]) {
            // Generate per-city URLs
            const cities = COUNTRY_CITIES[targetCountry];
            const parsed = new URL(apiUrl);
            const keywords = parsed.searchParams.get('keywords') || '';
            const extraParams = {};
            for (const [k, v] of parsed.searchParams.entries()) {
                if (!['keywords', 'location', 'start', 'position', 'pageNum', 'trk'].includes(k)) {
                    extraParams[k] = v;
                }
            }
            if (datePosted) extraParams.f_TPR = datePosted;

            log.info(`🌍 Splitting search into ${cities.length} city-level searches for "${targetCountry}"`);
            for (const city of cities) {
                const cityUrl = buildSearchUrl(keywords, city, 0, extraParams);
                await enqueueSearchPages(cityUrl, city);
            }
        } else {
            // Apply optional datePosted override
            if (datePosted) {
                const parsed = new URL(apiUrl);
                parsed.searchParams.set('f_TPR', datePosted);
                await enqueueSearchPages(parsed.toString());
            } else {
                await enqueueSearchPages(apiUrl);
            }
        }
    }
} else {
    // Build URLs from keywords
    for (const keyword of searchKeywords) {
        const extraParams = {};
        if (datePosted) extraParams.f_TPR = datePosted;

        if (splitSearchByLocation && targetCountry && COUNTRY_CITIES[targetCountry]) {
            const cities = COUNTRY_CITIES[targetCountry];
            log.info(`🌍 Splitting "${keyword}" across ${cities.length} cities in ${targetCountry}`);
            for (const city of cities) {
                const url = buildSearchUrl(keyword, city, 0, extraParams);
                await enqueueSearchPages(url, `${keyword} - ${city}`);
            }
        } else {
            const url = buildSearchUrl(keyword, searchLocation, 0, extraParams);
            await enqueueSearchPages(url, keyword);
        }
    }
}

log.info(`🚀 Starting scrape. Target: up to ${maxItems} jobs.`);

// ────────────────────────────────────────────────────────────────
// CRAWLER
// ────────────────────────────────────────────────────────────────
const crawler = new CheerioCrawler({
    requestQueue,
    proxyConfiguration,
    maxConcurrency: 5,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ request, $, response }) {
        const { type } = request.userData;

        if (type === 'SEARCH') {
            await handleSearch(request, $, response);
        } else if (type === 'JOB_DETAIL') {
            await handleJobDetail(request, $, response);
        } else if (type === 'COMPANY') {
            await handleCompany(request, $, response);
        }
    },

    async failedRequestHandler({ request }, error) {
        log.warning(`❌ Failed: ${request.url} — ${error.message}`);

        // If it was a job detail, push partial data
        if (request.userData.type === 'JOB_DETAIL' && request.userData.cardData) {
            await pushResult(request.userData.cardData);
        }
    },
});

// ────────────────────────────────────────────────────────────────
// HANDLERS
// ────────────────────────────────────────────────────────────────

async function handleSearch(request, $, response) {
    if (totalScraped >= maxItems) return;

    const statusCode = response?.statusCode;
    if (statusCode === 429) {
        log.warning('⚠️ Rate limited (429). Slowing down.');
        await sleep(5000);
        return;
    }
    if (statusCode !== 200) {
        log.warning(`⚠️ Status ${statusCode} on search page: ${request.url}`);
        return;
    }

    const cards = parseJobCards($);
    if (cards.length === 0) {
        log.debug(`📄 No jobs found at ${request.url}`);
        return;
    }

    const label = request.userData.label || '';
    log.info(`📄 Found ${cards.length} jobs ${label ? `(${label}) ` : ''}at offset ${getStartParam(request.url)}`);

    for (const card of cards) {
        if (totalScraped >= maxItems) break;
        if (scrapedIds.has(card.id)) continue;
        scrapedIds.add(card.id);

        if (scrapeJobDetails) {
            await requestQueue.addRequest({
                url: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`,
                uniqueKey: `detail-${card.id}`,
                userData: { type: 'JOB_DETAIL', cardData: card },
            }, { forefront: true });
        } else {
            await pushResult(card);
        }
    }

    await sleep(randomDelay(300, 800));
}

async function handleJobDetail(request, $, response) {
    if (totalScraped >= maxItems) return;

    const { cardData } = request.userData;
    const statusCode = response?.statusCode;

    if (isLoginWall($, statusCode)) {
        log.debug(`🔒 Login wall on job ${cardData.id}`);
        await pushResult(cardData);
        return;
    }

    if (statusCode !== 200) {
        log.debug(`⚠️ Status ${statusCode} on detail ${cardData.id}`);
        await pushResult(cardData);
        return;
    }

    const detail = parseJobDetail($);
    const merged = { ...cardData, ...detail };

    // Queue company scrape if enabled
    if (scrapeCompany && cardData.companyLinkedinUrl) {
        const slug = extractCompanySlug(cardData.companyLinkedinUrl);
        if (slug) {
            if (companyCache.has(slug)) {
                // Already scraped
                Object.assign(merged, companyCache.get(slug));
                await pushResult(merged);
            } else {
                // Queue company page
                const companyUrl = `https://www.linkedin.com/company/${slug}/about/`;
                const wasAdded = await requestQueue.addRequest({
                    url: companyUrl,
                    uniqueKey: `company-${slug}`,
                    userData: {
                        type: 'COMPANY',
                        slug,
                        pendingJobs: [merged],
                    },
                }, { forefront: false });

                // If request already existed, push with what we have
                if (!wasAdded.wasAlreadyPresent) {
                    // Will be pushed after company is scraped
                } else {
                    // Company already queued or done — check cache again
                    if (companyCache.has(slug)) {
                        Object.assign(merged, companyCache.get(slug));
                    }
                    await pushResult(merged);
                }
            }
        } else {
            await pushResult(merged);
        }
    } else {
        await pushResult(merged);
    }

    await sleep(randomDelay(200, 600));
}

async function handleCompany(request, $, response) {
    const { slug, pendingJobs = [] } = request.userData;
    const statusCode = response?.statusCode;

    let companyData = {};

    if (statusCode === 200 && !isLoginWall($, statusCode)) {
        companyData = parseCompanyPage($);
        companyCache.set(slug, companyData);
        log.debug(`🏢 Scraped company: ${slug}`);
    } else {
        log.debug(`⚠️ Could not scrape company ${slug} (status ${statusCode})`);
        companyCache.set(slug, {}); // Cache empty to avoid retrying
    }

    // Push all pending jobs that were waiting on this company
    for (const job of pendingJobs) {
        Object.assign(job, companyData);
        await pushResult(job);
    }

    await sleep(randomDelay(300, 700));
}

// ────────────────────────────────────────────────────────────────
// PUSH RESULT
// ────────────────────────────────────────────────────────────────

async function pushResult(data) {
    if (totalScraped >= maxItems) return;

    await Actor.pushData({
        id: data.id || null,
        link: data.link || null,
        title: data.title || null,
        companyName: data.companyName || null,
        companyLinkedinUrl: data.companyLinkedinUrl || null,
        companyLogo: data.companyLogo || null,
        location: data.location || null,
        salaryInfo: data.salaryInfo || [],
        postedAt: data.postedAt || null,
        benefits: data.benefits || [],
        descriptionHtml: data.descriptionHtml || null,
        descriptionText: data.descriptionText || null,
        applicantsCount: data.applicantsCount || null,
        applyUrl: data.applyUrl || null,
        jobPosterName: data.jobPosterName || null,
        jobPosterTitle: data.jobPosterTitle || null,
        jobPosterPhoto: data.jobPosterPhoto || null,
        jobPosterProfileUrl: data.jobPosterProfileUrl || null,
        seniorityLevel: data.seniorityLevel || null,
        employmentType: data.employmentType || null,
        jobFunction: data.jobFunction || null,
        industries: data.industries || null,
        companyDescription: data.companyDescription || null,
        companyWebsite: data.companyWebsite || null,
        companyEmployeesCount: data.companyEmployeesCount || null,
        companyIndustry: data.companyIndustry || null,
        companySpecialties: data.companySpecialties || null,
        companyType: data.companyType || null,
        companyFounded: data.companyFounded || null,
        companyHeadquarters: data.companyHeadquarters || null,
    });

    totalScraped++;

    if (totalScraped % 100 === 0) {
        log.info(`📊 Progress: ${totalScraped}/${maxItems} jobs scraped`);
    }
}

// ────────────────────────────────────────────────────────────────
// RUN
// ────────────────────────────────────────────────────────────────
await crawler.run();

log.info(`✅ Done! Scraped ${totalScraped} jobs.`);

await Actor.setValue('SUMMARY', {
    totalScraped,
    startUrls: startUrls.length,
    searchKeywords,
    splitSearchByLocation,
    completedAt: new Date().toISOString(),
});

await Actor.exit();
