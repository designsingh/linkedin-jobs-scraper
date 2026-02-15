# LinkedIn Jobs Scraper - PPR

Scrape jobs from LinkedIn jobs search results along with company details. Get key information to find contact info.

This tool scrapes jobs from the public version of LinkedIn jobs search which **does not require cookies or login**.

## Getting Started

1. Go to [LinkedIn jobs search page](https://www.linkedin.com/jobs/search/)
2. Search with your required filters
3. Once done, copy the full URL from the address bar
4. Paste the URL into this actor's **Start URLs** input field

Alternatively, provide **Search Keywords** and **Search Location** directly.

## Features

- **No cookies or login required** — scrapes publicly accessible data only
- **Company details** — description, website, employee count, industry, specialties
- **Job poster info** — recruiter name, title, photo, profile URL
- **Full job descriptions** — HTML and plain text
- **Salary info** — when available from LinkedIn
- **Split search by location** — overcome LinkedIn's ~1000 results limit per search by auto-splitting into city-level searches
- **Deduplication** — automatically ignores duplicate jobs across searches
- **PPR pricing** — pay per result model

## Related Scrapers

- [Indeed jobs scraper](https://apify.com/curious_coder/indeed-scraper) — extract jobs data from Indeed
- [Apollo leads scraper](https://apify.com/curious_coder/apollo-io-scraper) — find email addresses for companies

## Overcoming LinkedIn's 1000 Job Limit

LinkedIn limits the number of jobs per search to ~1000 even though total matching jobs are far more. To overcome this:

1. Enable **"Split search URLs by location"**
2. Select a **Target Country**
3. The scraper will generate multiple search URLs targeting different cities in that country
4. Duplicate jobs are automatically ignored

## Sample Output Data

```json
{
    "id": "3692563200",
    "link": "https://www.linkedin.com/jobs/view/3692563200",
    "title": "English Data Labeling Analyst",
    "companyName": "Facebook",
    "companyLinkedinUrl": "https://www.linkedin.com/company/facebook",
    "companyLogo": "https://media.licdn.com/dms/image/...",
    "location": "Los Angeles Metropolitan Area",
    "salaryInfo": ["$17.00", "$19.00"],
    "postedAt": "2025-08-16",
    "benefits": ["Actively Hiring"],
    "descriptionHtml": "<p>APPROVED REMOTE LOCATIONS: ...</p>",
    "descriptionText": "APPROVED REMOTE LOCATIONS: ...",
    "applicantsCount": "200",
    "applyUrl": "",
    "jobPosterName": "Andrea Cowan",
    "jobPosterTitle": "Technical Recruiter at Meta",
    "jobPosterPhoto": "https://media.licdn.com/dms/image/...",
    "jobPosterProfileUrl": "https://ca.linkedin.com/in/andrea-cowan-458b5423b",
    "seniorityLevel": "Associate",
    "employmentType": "Contract",
    "jobFunction": "Other",
    "industries": "Retail Office Equipment",
    "companyDescription": "The Facebook company is now Meta...",
    "companyWebsite": "https://www.meta.com",
    "companyEmployeesCount": 36275,
    "companyIndustry": "Technology, Information and Internet",
    "companySpecialties": null,
    "companyType": "Public Company",
    "companyFounded": "2004",
    "companyHeadquarters": "Menlo Park, CA"
}
```

## Output Fields

| Field | Description |
|---|---|
| `id` | Unique LinkedIn job posting ID |
| `link` | Direct URL to job listing |
| `title` | Job title |
| `companyName` | Hiring company name |
| `companyLinkedinUrl` | Company's LinkedIn page |
| `companyLogo` | Company logo URL |
| `location` | Job location |
| `salaryInfo` | Salary range (array) |
| `postedAt` | Date posted |
| `benefits` | Job benefits/badges |
| `descriptionHtml` | Full description in HTML |
| `descriptionText` | Full description in plain text |
| `applicantsCount` | Number of applicants |
| `applyUrl` | External application URL |
| `jobPosterName` | Recruiter/poster name |
| `jobPosterTitle` | Recruiter/poster title |
| `jobPosterPhoto` | Recruiter/poster photo URL |
| `jobPosterProfileUrl` | Recruiter/poster LinkedIn profile |
| `seniorityLevel` | Seniority level |
| `employmentType` | Employment type |
| `jobFunction` | Job function |
| `industries` | Industry |
| `companyDescription` | Full company description |
| `companyWebsite` | Company website URL |
| `companyEmployeesCount` | Number of employees |
| `companyIndustry` | Company industry |
| `companySpecialties` | Company specialties |
| `companyType` | Company type (Public, Private, etc.) |
| `companyFounded` | Year founded |
| `companyHeadquarters` | HQ location |

## Programmatic Usage

### Python

```python
from apify_client import ApifyClient

client = ApifyClient("YOUR_API_TOKEN")

run_input = {
    "startUrls": [
        {"url": "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=United%20States"}
    ],
    "maxItems": 500,
    "scrapeCompany": True,
    "scrapeJobDetails": True,
}

run = client.actor("YOUR_USERNAME/linkedin-jobs-scraper").call(run_input=run_input)

for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(f"{item['title']} at {item['companyName']} - {item['location']}")
```

### Node.js

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_API_TOKEN' });

const run = await client.actor('YOUR_USERNAME/linkedin-jobs-scraper').call({
    startUrls: [
        { url: 'https://www.linkedin.com/jobs/search/?keywords=data+scientist&location=United+States' }
    ],
    maxItems: 500,
    scrapeCompany: true,
    scrapeJobDetails: true,
});

const { items } = await client.dataset(run.defaultDatasetId).listItems();
items.forEach((item) => console.log(`${item.title} at ${item.companyName}`));
```

## Integrations

You can use **Make** or **Zapier** to integrate this scraper with any other SaaS platform by designing your own automation flows.

The actor stores results in a dataset. You can export data in various formats such as CSV, JSON, XLS, etc. You can scrape and access data on demand using the API.

## Support

If you've got any technical feedback or found a bug, please create an issue on the actor's Issues tab in Apify Console.
