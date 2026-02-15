import { log } from 'apify';
import { extractJobId, extractTrackingParams, normalizeUrl } from './utils.js';

// ────────────────────────────────────────────────────────────────
// 1) SEARCH RESULTS PAGE (list of job cards)
// ────────────────────────────────────────────────────────────────

/**
 * Parse job cards from the LinkedIn guest search API HTML response.
 * Each <li> contains a job card with title, company, location, etc.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<Object>}
 */
export function parseJobCards($) {
    const jobs = [];

    $('li').each((_, el) => {
        try {
            const $card = $(el);

            // Job link & ID (preserve full URL with tracking params for competitor compatibility)
            const rawLink =
                $card.find('a.base-card__full-link').attr('href') ||
                $card.find('a[data-tracking-control-name*="search-card"]').attr('href') ||
                $card.find('a').first().attr('href') ||
                '';
            const link = normalizeUrl(rawLink);
            const id = extractJobId(rawLink);
            const { trackingId, refId } = extractTrackingParams(rawLink);
            if (!id) return;

            // Title
            const title = (
                $card.find('h3.base-search-card__title').text() ||
                $card.find('h3').first().text() ||
                ''
            ).trim();

            // Company
            const companyName = (
                $card.find('h4.base-search-card__subtitle a').text() ||
                $card.find('h4.base-search-card__subtitle').text() ||
                $card.find('h4').first().text() ||
                ''
            ).trim();

            const companyLinkedinUrl = normalizeUrl(
                $card.find('h4.base-search-card__subtitle a').attr('href') || '',
            );

            // Company logo
            const companyLogo =
                $card.find('img[data-delayed-url]').attr('data-delayed-url') ||
                $card.find('img.artdeco-entity-image').attr('src') ||
                $card.find('img').first().attr('data-delayed-url') ||
                $card.find('img').first().attr('src') ||
                '';

            // Location
            const location = (
                $card.find('span.job-search-card__location').text() ||
                ''
            ).trim();

            // Date
            const postedAt =
                $card.find('time').attr('datetime') ||
                $card.find('time').text().trim() ||
                '';

            // Salary
            const salaryParts = [];
            $card.find('span.job-search-card__salary-info').each((_, s) => {
                const t = $(s).text().trim();
                if (t) salaryParts.push(t);
            });
            const salaryInfo = salaryParts.length > 0 ? salaryParts : [];

            // Benefits / badges
            const benefits = [];
            $card.find('span.result-benefits__text').each((_, s) => {
                const t = $(s).text().trim();
                if (t) benefits.push(t);
            });

            if (title || companyName) {
                jobs.push({
                    id,
                    trackingId,
                    refId,
                    link,
                    title: title || 'N/A',
                    companyName: companyName || 'N/A',
                    companyLinkedinUrl,
                    companyLogo,
                    location: location || 'N/A',
                    salaryInfo,
                    postedAt: postedAt || null,
                    benefits,
                });
            }
        } catch (err) {
            log.debug(`Error parsing card: ${err.message}`);
        }
    });

    return jobs;
}

// ────────────────────────────────────────────────────────────────
// 2) JOB DETAIL PAGE (/jobs-guest/jobs/api/jobPosting/{id})
// ────────────────────────────────────────────────────────────────

/**
 * Parse a LinkedIn job detail page.
 * Returns description, criteria, poster info, applicant count, etc.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Object}
 */
export function parseJobDetail($) {
    const detail = {};

    // ── Description ──
    const descEl =
        $('div.show-more-less-html__markup').first() ||
        $('div.description__text .core-section-container__content').first();

    detail.descriptionHtml = descEl.html()?.trim() || null;
    detail.descriptionText = descEl.text()?.trim() || null;

    // ── Job criteria (seniority, type, function, industry) ──
    $('li.description__job-criteria-item').each((_, el) => {
        const $item = $(el);
        const label = ($item.find('h3').text() || '').trim().toLowerCase();
        const value = ($item.find('span').text() || '').trim();
        if (!value) return;

        if (label.includes('seniority') || label.includes('experience')) {
            detail.seniorityLevel = value;
        } else if (label.includes('employment') || label.includes('job type')) {
            detail.employmentType = value;
        } else if (label.includes('function')) {
            detail.jobFunction = value;
        } else if (label.includes('industr')) {
            detail.industries = value;
        }
    });

    // ── Applicant count ──
    const applicantsText = (
        $('span.num-applicants__caption').text() ||
        $('figcaption').text() ||
        ''
    ).trim();
    const appMatch = applicantsText.match(/([\d,]+)/);
    if (appMatch) {
        detail.applicantsCount = appMatch[1].replace(/,/g, '');
    }

    // ── Apply URL ──
    const applyLink =
        $('a.apply-button').attr('href') ||
        $('a[data-tracking-control-name*="apply"]').attr('href') ||
        $('code#applyUrl').text().trim() ||
        '';
    detail.applyUrl = applyLink ? normalizeUrl(applyLink) : '';

    // ── Salary (string, for competitor compatibility) ──
    const salaryText = $('span.compensation__salary').text()?.trim() ||
        $('div.compensation__range').text()?.trim() ||
        '';
    detail.salary = salaryText || '';

    // ── Job poster info ──
    const posterCard = $('div.message-the-recruiter, div.base-main-card');
    if (posterCard.length) {
        detail.jobPosterName = (
            posterCard.find('h3.base-main-card__title').text() ||
            posterCard.find('h4.message-the-recruiter__title').text() ||
            ''
        ).trim() || null;

        detail.jobPosterTitle = (
            posterCard.find('h4.base-main-card__subtitle').text() ||
            posterCard.find('p.message-the-recruiter__headline').text() ||
            ''
        ).trim() || null;

        detail.jobPosterPhoto =
            posterCard.find('img').attr('data-delayed-url') ||
            posterCard.find('img').attr('src') ||
            null;

        const posterLink = posterCard.find('a').attr('href') || '';
        detail.jobPosterProfileUrl = posterLink ? normalizeUrl(posterLink) : null;
    }

    return detail;
}

// ────────────────────────────────────────────────────────────────
// 3) COMPANY PAGE (public linkedin.com/company/{slug})
// ────────────────────────────────────────────────────────────────

/**
 * Parse a public LinkedIn company page.
 * Returns description, website, employee count, slogan, address, etc.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Object}
 */
export function parseCompanyPage($) {
    const company = {};

    // Description
    const descEl = $('section.core-section-container p.break-words').first() ||
                   $('p.break-words').first();
    company.companyDescription = descEl.text()?.trim() || null;

    // Slogan / tagline (competitor compatibility)
    company.companySlogan = (
        $('p.about-us__content').first().text() ||
        $('section.core-section-container p').first().text() ||
        ''
    ).trim() || null;

    // Website
    const websiteLink =
        $('a[data-tracking-control-name="about_website"]').attr('href') ||
        $('dd.mb4 a[rel="noopener noreferrer"]').first().attr('href') ||
        '';
    company.companyWebsite = websiteLink || null;

    // Employee count from text like "10,001+ employees"
    const staffText = $('a[data-tracking-control-name="about_employees"]').text() ||
                      $('dd.mb4').filter((_, el) => /employees/i.test($(el).text())).text() ||
                      '';
    const staffMatch = staffText.match(/([\d,]+)/);
    if (staffMatch) {
        company.companyEmployeesCount = parseInt(staffMatch[1].replace(/,/g, ''), 10);
    }

    // Company address from JSON-LD or dt/dd
    company.companyAddress = parseCompanyAddress($);

    // Industry / specialties from dt/dd pairs
    $('dt').each((_, dtEl) => {
        const label = $(dtEl).text().trim().toLowerCase();
        const value = $(dtEl).next('dd').text().trim();
        if (!value) return;
        if (label.includes('industr')) company.companyIndustry = value;
        if (label.includes('specialt')) company.companySpecialties = value;
        if (label.includes('type')) company.companyType = value;
        if (label.includes('founded')) company.companyFounded = value;
        if (label.includes('headquarters')) company.companyHeadquarters = value;
    });

    return company;
}

/**
 * Parse company address into PostalAddress structure (competitor compatibility).
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Object|null}
 */
function parseCompanyAddress($) {
    // Try JSON-LD first
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
        try {
            const json = JSON.parse($(scripts[i]).html() || '{}');
            const org = Array.isArray(json) ? json.find((o) => o['@type'] === 'Organization') : (json['@type'] === 'Organization' ? json : null);
            if (org?.address) {
                const addr = org.address;
                if (addr['@type'] === 'PostalAddress' || addr.streetAddress || addr.addressLocality) {
                    const country = addr.addressCountry;
                    const countryStr = typeof country === 'string'
                        ? country
                        : (country?.name ?? country?.['@id'] ?? null);
                    return {
                        type: 'PostalAddress',
                        streetAddress: addr.streetAddress || null,
                        addressLocality: addr.addressLocality || null,
                        addressRegion: addr.addressRegion || null,
                        postalCode: addr.postalCode || null,
                        addressCountry: countryStr || null,
                    };
                }
            }
        } catch { /* ignore */ }
    }

    // Fallback: parse from headquarters dd
    const hqText = $('dd').filter((_, el) => /headquarters/i.test($(el).prev('dt').text())).first().text().trim();
    if (hqText) {
        const parts = hqText.split(/,\s*/);
        return {
            type: 'PostalAddress',
            streetAddress: parts[0] || null,
            addressLocality: parts[1] || null,
            addressRegion: parts[2] || null,
            postalCode: null,
            addressCountry: parts[parts.length - 1] || null,
        };
    }

    return null;
}

/**
 * Detect whether a response contains a LinkedIn login / auth wall.
 * @param {import('cheerio').CheerioAPI} $
 * @param {number} statusCode
 * @returns {boolean}
 */
export function isLoginWall($, statusCode) {
    if (statusCode === 401 || statusCode === 403) return true;
    const html = $.html() || '';
    return (
        html.includes('authwall') ||
        html.includes('sign-in-modal') ||
        html.includes('uas-login') ||
        html.includes('/login')
    );
}
