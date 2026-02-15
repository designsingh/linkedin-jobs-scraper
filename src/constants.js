/**
 * Major cities per country for the "split search by location" feature.
 * When enabled, the scraper creates separate searches per city to overcome
 * LinkedIn's ~1000 result cap per search.
 */
export const COUNTRY_CITIES = {
    usa: [
        'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
        'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
        'San Francisco', 'Columbus', 'Indianapolis', 'Fort Worth', 'Charlotte',
        'Seattle', 'Denver', 'Washington DC', 'Nashville', 'Oklahoma City',
        'Boston', 'Portland', 'Las Vegas', 'Memphis', 'Louisville', 'Baltimore',
        'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento', 'Mesa',
        'Kansas City', 'Atlanta', 'Omaha', 'Raleigh', 'Miami', 'Minneapolis',
        'Tampa', 'New Orleans', 'Cleveland', 'Honolulu', 'Pittsburgh', 'St. Louis',
        'Cincinnati', 'Orlando', 'Salt Lake City', 'Detroit',
    ],
    uk: [
        'London', 'Birmingham', 'Manchester', 'Glasgow', 'Leeds', 'Liverpool',
        'Edinburgh', 'Bristol', 'Sheffield', 'Cardiff', 'Nottingham', 'Leicester',
        'Newcastle', 'Brighton', 'Southampton', 'Reading', 'Cambridge', 'Oxford',
        'Belfast', 'Aberdeen',
    ],
    canada: [
        'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa',
        'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener', 'Halifax', 'Victoria',
        'Saskatoon', 'Regina', 'St. John\'s',
    ],
    india: [
        'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune',
        'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow', 'Noida', 'Gurgaon',
        'Chandigarh', 'Indore', 'Coimbatore', 'Kochi', 'Thiruvananthapuram',
        'Nagpur', 'Bhopal', 'Visakhapatnam',
    ],
    germany: [
        'Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Stuttgart',
        'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden',
        'Hannover', 'Nuremberg', 'Bonn',
    ],
    france: [
        'Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice', 'Nantes',
        'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Grenoble',
    ],
    australia: [
        'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra',
        'Gold Coast', 'Hobart', 'Darwin', 'Newcastle',
    ],
    netherlands: [
        'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven',
        'Groningen', 'Tilburg', 'Almere', 'Breda',
    ],
    spain: [
        'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Bilbao', 'Malaga',
        'Zaragoza', 'Palma', 'Alicante',
    ],
    italy: [
        'Milan', 'Rome', 'Turin', 'Naples', 'Bologna', 'Florence',
        'Genoa', 'Venice', 'Verona', 'Palermo',
    ],
    brazil: [
        'São Paulo', 'Rio de Janeiro', 'Brasília', 'Belo Horizonte',
        'Porto Alegre', 'Curitiba', 'Recife', 'Fortaleza', 'Salvador', 'Campinas',
    ],
    singapore: ['Singapore'],
    japan: [
        'Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Fukuoka', 'Sapporo',
        'Kobe', 'Kyoto', 'Sendai',
    ],
    uae: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman'],
};
