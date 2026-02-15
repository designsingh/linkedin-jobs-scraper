import { Actor, log } from 'apify';
import { CheerioCrawler, RequestQueue } from 'crawlee';
import { COUNTRY_CITIES } from './constants.js';
import { parseJobCards, parseJobDetail, parseCompanyPage, isLoginWall } from './parsers.js';
import {
    sleep, randomDelay, extractJobId, normalizeUrl,
    extractCompanySlug, buildSearchUrl, buildHumanSearchUrl, toGuestApiUrl,
    getStartParam, setStartParam, formatPostedAt, getLinkedInOrigin,
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

/** Human-readable search URL for output (competitor compatibility) */
let inputUrl = '';

/**
 * Enqueue all paginated search URLs for a single base URL.
 */
async function enqueueSearchPages(baseApiUrl, label = '', searchInputUrl = '') {
    const pagesNeeded = Math.ceil(maxItems / 25);
    for (let page = 0; page < pagesNeeded; page++) {
        const url = setStartParam(baseApiUrl, page * 25);
        await requestQueue.addRequest({
            url,
            uniqueKey: url,
            userData: { type: 'SEARCH', label, inputUrl: searchInputUrl },
        });
    }
}

// ── Build initial search queue ───────────────────────────────
if (hasStartUrls) {
    for (const entry of startUrls) {
        const rawUrl = typeof entry === 'string' ? entry : entry.url;
        if (!rawUrl) continue;

        inputUrl = rawUrl;
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
                const humanUrl = buildHumanSearchUrl(keywords, city, datePosted ? { f_TPR: datePosted } : {});
                await enqueueSearchPages(cityUrl, city, humanUrl);
            }
        } else {
            // Apply optional datePosted override
            if (datePosted) {
                const parsed = new URL(apiUrl);
                parsed.searchParams.set('f_TPR', datePosted);
                await enqueueSearchPages(parsed.toString(), '', rawUrl);
            } else {
                await enqueueSearchPages(apiUrl, '', rawUrl);
            }
        }
    }
} else {
    // Build URLs from keywords
    for (const keyword of searchKeywords) {
        const extraParams = {};
        if (datePosted) extraParams.f_TPR = datePosted;
        inputUrl = buildHumanSearchUrl(keyword, searchLocation, datePosted ? { f_TPR: datePosted } : {});

        if (splitSearchByLocation && targetCountry && COUNTRY_CITIES[targetCountry]) {
            const cities = COUNTRY_CITIES[targetCountry];
            log.info(`🌍 Splitting "${keyword}" across ${cities.length} cities in ${targetCountry}`);
            for (const city of cities) {
                const url = buildSearchUrl(keyword, city, 0, extraParams);
                const humanUrl = buildHumanSearchUrl(keyword, city, extraParams);
                await enqueueSearchPages(url, `${keyword} - ${city}`, humanUrl);
            }
        } else {
            const url = buildSearchUrl(keyword, searchLocation, 0, extraParams);
            await enqueueSearchPages(url, keyword, inputUrl);
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
    maxConcurrency: 3,
    maxRequestRetries: 5,
    requestHandlerTimeoutSecs: 60,
    sessionPoolOptions: { maxPoolSize: 20 },
    useSessionPool: true,
    persistCookiesPerSession: true,

    // Tell Crawlee not to auto-throw on 429 — we handle it ourselves with backoff
    ignoreHttpErrorStatusCodes: [429, 999],

    // Add browser-like headers so LinkedIn doesn't detect CheerioCrawler as a bot
    preNavigationHooks: [
        async (crawlingContext, gotOptions) => {
            gotOptions.headers = {
                ...gotOptions.headers,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            };
        },
    ],

    async requestHandler({ request, $, response, session }) {
        const { type } = request.userData;

        if (type === 'SEARCH') {
            await handleSearch(request, $, response);
        } else if (type === 'JOB_DETAIL') {
            await handleJobDetail(request, $, response);
        } else if (type === 'COMPANY') {
            await handleCompany(request, $, response, session);
        }
    },

    async failedRequestHandler({ request }, error) {
        log.warning(`❌ Failed: ${request.url} — ${error.message}`);

        // If it was a job detail, push partial data
        if (request.userData.type === 'JOB_DETAIL' && request.userData.cardData) {
            await pushResult(request.userData.cardData);
        }

        // If it was a company page, push pending jobs without company data
        if (request.userData.type === 'COMPANY') {
            const { slug, pendingJobs = [] } = request.userData;
            const overflow = pendingCompanies.get(slug) || [];
            const totalPending = pendingJobs.length + overflow.length;
            log.warning(`⚠️ Company ${slug} failed permanently, pushing ${totalPending} jobs without company data`);
            companyCache.set(slug, {});
            for (const job of [...pendingJobs, ...overflow]) {
                await pushResult(job);
            }
            pendingCompanies.delete(slug);
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

    const searchInputUrl = request.userData.inputUrl || inputUrl || '';

    let skippedDuplicates = 0;
    for (const card of cards) {
        if (totalScraped >= maxItems) break;
        if (scrapedIds.has(card.id)) {
            skippedDuplicates++;
            continue;
        }
        scrapedIds.add(card.id);

        const cardWithInput = { ...card, inputUrl: searchInputUrl };

        if (scrapeJobDetails) {
            // Always use www.linkedin.com for the guest API (regional subdomains like ca. get blocked)
            await requestQueue.addRequest({
                url: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`,
                uniqueKey: `detail-${card.id}`,
                userData: { type: 'JOB_DETAIL', cardData: cardWithInput },
            }, { forefront: true });
        } else {
            await pushResult(cardWithInput);
        }
    }
    if (skippedDuplicates > 0) {
        log.warning(`🟠 Skipped ${skippedDuplicates} duplicate jobs`);
    }

    await sleep(randomDelay(300, 800));
}

async function handleJobDetail(request, $, response) {
    if (totalScraped >= maxItems) return;

    const { cardData } = request.userData;
    const statusCode = response?.statusCode;

    // Handle 429 rate limit: throw so Crawlee retries with a different session/proxy
    if (statusCode === 429 || statusCode === 999) {
        const backoff = (request.retryCount || 0) * 3000 + randomDelay(2000, 5000);
        log.warning(`⚠️ Rate limited (${statusCode}) on job ${cardData.id}, retrying in ${Math.round(backoff / 1000)}s`);
        await sleep(backoff);
        throw new Error(`Rate limited ${statusCode} on job ${cardData.id}`);
    }

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
                // Queue company page (always use www to avoid regional blocks)
                const companyUrl = `https://www.linkedin.com/company/${slug}`;
                const wasAdded = await requestQueue.addRequest({
                    url: companyUrl,
                    uniqueKey: `company-${slug}`,
                    userData: {
                        type: 'COMPANY',
                        slug,
                        pendingJobs: [merged],
                    },
                }, { forefront: false });

                if (!wasAdded.wasAlreadyPresent) {
                    // First job for this company — will be pushed after company is scraped
                    // Also init the overflow list for any additional jobs with same company
                    pendingCompanies.set(slug, []);
                } else {
                    // Company already queued — check if it's done
                    if (companyCache.has(slug)) {
                        Object.assign(merged, companyCache.get(slug));
                        await pushResult(merged);
                    } else {
                        // Still being scraped — park this job until company finishes
                        if (!pendingCompanies.has(slug)) {
                            pendingCompanies.set(slug, []);
                        }
                        pendingCompanies.get(slug).push(merged);
                    }
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

async function handleCompany(request, $, response, session) {
    const { slug, pendingJobs = [] } = request.userData;
    const statusCode = response?.statusCode;
    const htmlLength = $.html()?.length || 0;
    const retryCount = request.retryCount || 0;

    let companyData = {};

    if (statusCode === 999 || statusCode === 429) {
        if (retryCount < 4) {
            // Retire this session (bad proxy IP) so Crawlee picks a fresh one
            if (session) session.retire();
            const backoff = retryCount * 2000 + randomDelay(1000, 3000);
            log.info(`⚠️ Company ${slug} blocked (${statusCode}), retry ${retryCount + 1}/5 in ${Math.round(backoff / 1000)}s`);
            await sleep(backoff);
            throw new Error(`Company ${slug} blocked (${statusCode})`);
        }
        // Exhausted retries — give up gracefully
        log.info(`⚠️ Company ${slug} blocked after ${retryCount} retries, skipping`);
        companyCache.set(slug, {});
    } else if (statusCode === 200 && !isLoginWall($, statusCode)) {
        companyData = parseCompanyPage($);
        const fieldCount = Object.values(companyData).filter(v => v != null).length;
        log.info(`🏢 Company ${slug}: ${fieldCount} fields (status=${statusCode}, html=${htmlLength})`);
        companyCache.set(slug, companyData);
    } else {
        const loginWall = isLoginWall($, statusCode);
        if (loginWall && retryCount < 4) {
            if (session) session.retire();
            log.info(`⚠️ Company ${slug} login wall (status=${statusCode}), retry ${retryCount + 1}/5`);
            throw new Error(`Company ${slug} login wall`);
        }
        log.info(`⚠️ Company ${slug}: status=${statusCode}, html=${htmlLength}, loginWall=${loginWall}`);
        companyCache.set(slug, {});
    }

    // Push all pending jobs that were waiting on this company
    // 1) Jobs stored in the request's userData (first job that triggered the queue)
    for (const job of pendingJobs) {
        Object.assign(job, companyData);
        await pushResult(job);
    }
    // 2) Overflow jobs added while the company page was being retried
    const overflow = pendingCompanies.get(slug) || [];
    for (const job of overflow) {
        Object.assign(job, companyData);
        await pushResult(job);
    }
    pendingCompanies.delete(slug);

    await sleep(randomDelay(300, 700));
}

// ────────────────────────────────────────────────────────────────
// PUSH RESULT
// ────────────────────────────────────────────────────────────────

async function pushResult(data) {
    if (totalScraped >= maxItems) return;

    const salaryStr = data.salary ?? (Array.isArray(data.salaryInfo) && data.salaryInfo.length
        ? data.salaryInfo.filter(Boolean).join(' – ')
        : '');

    await Actor.pushData({
        id: data.id || null,
        trackingId: data.trackingId ?? null,
        refId: data.refId ?? null,
        link: data.link || null,
        title: data.title || null,
        companyName: data.companyName || null,
        companyLinkedinUrl: data.companyLinkedinUrl || null,
        companyLogo: data.companyLogo || null,
        location: data.location || null,
        salaryInfo: data.salaryInfo || [],
        salary: salaryStr || '',
        postedAt: formatPostedAt(data.postedAt) || data.postedAt || null,
        benefits: data.benefits || [],
        descriptionHtml: data.descriptionHtml || null,
        descriptionText: data.descriptionText || null,
        applicantsCount: data.applicantsCount || null,
        applyUrl: data.applyUrl ?? '',
        jobPosterName: data.jobPosterName || null,
        jobPosterTitle: data.jobPosterTitle || null,
        jobPosterPhoto: data.jobPosterPhoto || null,
        jobPosterProfileUrl: data.jobPosterProfileUrl || null,
        seniorityLevel: data.seniorityLevel || null,
        employmentType: data.employmentType || null,
        jobFunction: data.jobFunction || null,
        industries: data.industries || null,
        inputUrl: data.inputUrl || inputUrl || null,
        companyDescription: data.companyDescription || null,
        companyWebsite: data.companyWebsite || null,
        companyEmployeesCount: data.companyEmployeesCount ?? null,
        companyIndustry: data.companyIndustry || null,
        companySpecialties: data.companySpecialties || null,
        companyType: data.companyType || null,
        companyFounded: data.companyFounded || null,
        companyHeadquarters: data.companyHeadquarters || null,
        companySlogan: data.companySlogan || null,
        companyAddress: data.companyAddress || null,
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
