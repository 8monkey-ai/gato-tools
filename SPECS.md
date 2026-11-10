# Gato tools

## Purpose

The Gato tools service gives agents four independent retail tools through MCP: device availability, sale or trade-in value, promotions, and store discovery. Each tool owns its business rules, data needs, and acceptance cases.

This specification is the source of truth for the required product behavior and architecture, including edge cases. It is the reference for development, acceptance, and future changes. Each present-tense statement specifies required behavior or architecture. It does not report implementation status. A requirement stays in this document after its implementation is complete, and it changes only when the intended behavior changes. `AGENTS.md` gives the contributor rules. `README.md` gives the setup and operating instructions.

## 1. Service and markets

The service is a separate TypeScript service that runs on Bun. It exposes the tools through MCP and reads file-based catalogue data. Integration details follow the [MCP documentation](https://modelcontextprotocol.io/docs/getting-started/intro). A failure in one tool does not prevent unrelated tools from operating.

The tools need no conversation history. They do not generate replies, send customer messages, reserve stock, or process purchases or payments. An external container and storage service owns hosting, credentials, releases, backups, and restoration.

Each deployment selects one market, the source locations and access, and the timezone:

| Market      | Code | Currency |
| ----------- | ---- | -------- |
| Malaysia    | MY   | RM       |
| Philippines | PH   | PHP      |

Prices, values, and fixed amounts use the currency of the configured market. Dates use UTC unless the deployment configures another timezone. The market selection does not change the timezone.

### Acceptance cases

- When the stock source is unavailable, promotions and store discovery still answer.
- A PH deployment exposes device availability, promotions, and store discovery only.
- A PH deployment with no timezone setting uses UTC.

## 2. Device availability

This tool helps the agent find a requested device, explain its availability and price, and offer the permitted alternatives when no exact available match exists. It is available in both markets.

### Requests and results

The tool accepts a device description, and optionally a promotion-only preference, a budget range, and a price order. When the request names no model, the search covers all eligible stock. A request that gives only a model number does not restrict stock by that number.

A result lists at most ten devices. Each device shows its model, relevant specifications, condition, availability, and retail price. It also shows each supplied promotion, previous-month, bundle, and payment-plan price. A monthly quote is labelled as monthly and is not recalculated. A device includes checkout and video links where the stock data supplies them. When a device has more than one video candidate, different calls can select different videos.

A result includes only devices labelled Stock Present, Low Stock, or Out of Stock. It omits devices with any other stock status. Stores appear only for Stock Present and Low Stock devices. If such a device lists no branch, the result says "Online Only". Out of Stock devices show no stores.

The tool has distinct outcomes for an unrecognized description, a recognized category that the catalogue does not contain, and a recognized search with no matches. Each of these differs from the outcome for unavailable or unusable source data.

### Matching

Recognition covers iPhone, Apple Watch, iPad, Mac, Pixel, Samsung, HONOR, OPPO, Vivo, PlayStation, Switch, and AirPods requests where the catalogue supports them, with their supported vocabulary and aliases. Matching tolerates capitalization, punctuation, extra descriptive words, and minor spelling mistakes. It keeps different numbered models and sibling product lines apart.

Matching distinguishes the model from storage, color, condition, size, chipset, connectivity, material, generation, and year. These rules apply:

- GB and TB values stay distinct. Matching does not convert between the units.
- With no other generation or size, "iPad Air 5" means the fifth generation and "iPad Pro 11" means the 11-inch size.
- Used, refurbished, pre-owned, and second-hand mean used condition.
- WiFi or GPS is recognized with optional cellular. Cellular, LTE, 4G, or 5G alone indicates cellular capability.
- A multiword color takes precedence over material, so Natural Titanium is a color. A color can match a longer catalogue color, for example Black matches Space Black.

Most specification comparisons ignore capitalization. A blank catalogue specification does not exclude a match. A family request without a number can match a numbered model of that family, but not a model of a sibling line.

### Search

The search runs these steps in order:

1. Exact preferences. Matches satisfy the model and the requested specifications. With promotion only, a match needs a supplied promotion price. An ordinary search includes devices with and without a promotion. Budget bounds are inclusive. The tool rejects budget bounds that are not increasing, nonnegative whole numbers, including decimal bounds. Budget filtering uses a whole-number promotion price, otherwise a whole-number retail price. It excludes a row when that selected price cannot be read as a whole number.
2. Relaxation. If step 1 finds nothing, the search removes preferences in this order and stops when it finds results: condition, color, storage, size, chipset, connectivity, budget, promotion only. Before it removes the budget, it widens each end of the budget by 250, then by 250 again, and keeps the lower bound at zero or more. Category, model, generation, year, and material stay fixed in this step.
3. Stock preference. When any matches are Stock Present or Low Stock, only those matches remain. When all matches are Out of Stock, the search tries the immediately newer model or generation, then the immediately older one, with the same relaxation as step 2. Newer takes precedence when both are available. If neither works, the original Out of Stock matches remain.
4. Order and limit. The search excludes rows with an unusable retail price. It then sorts by the numeric promotion price where available, otherwise by the retail price. Decimal prices can determine the order. Highest price first is the default. Lowest price first is also supported, with available stock first and stable ties. The result has at most ten devices.

A result identifies a newer or older model substitution. The adjustment report names the preference removal that first produced results, and also the budget relaxation when the search attempted it. It does not name earlier removals that produced nothing. When step 4 excludes every remaining row for an unusable retail price, the result is an empty device list. An empty search before step 4 is the no-match outcome.

### Stock data and updates

Operations publishes stock through the configured object-storage feed. Feed preparation runs at startup and about every five minutes, and preparation jobs never overlap. An environment that shares production sources can disable publication. Preparation keeps the market's product mappings, branch names and branch order, supplied specifications, prices, and links. Stock that the source marks explicitly as new has new condition. All other condition entries mean used.

Stock classification compares the source quantity as text. A quantity that sorts after "3" in text order is Stock Present. Otherwise, exactly "0" is Out of Stock and any other value is Low Stock. These are text comparisons, not numeric thresholds. For example, 4 and 30 are Stock Present, while 10, 100, and a blank quantity are Low Stock. A supplied branch entry that is not exactly "0" includes that branch. This includes a blank entry.

Queries use a complete published version. The service keeps loaded stock for five minutes. After that, queries can use the previous version while a refresh runs. A failed refresh logs the problem and keeps that version with no maximum stale age, and a later refresh can still replace it. A failed initial load is an error. A successfully loaded empty catalogue is valid. The service loads the source again after a restart. The serving revision, its age, and failures are visible. An interrupted preparation never publishes a partial catalogue.

### Acceptance cases

- "Used iPhone 12 Black 128GB" identifies the iPhone 12 in used condition, color Black, with 128GB storage.
- "iPad Air 5" matches the fifth generation and "iPad Pro 11" matches the 11-inch size. "Natural Titanium" matches as a color, not a material. Black matches Space Black.
- A 1TB request does not match a 1024GB row. A request for iPhone 12 does not match iPhone 13. A request for "iPad Air" can match a numbered iPad Air but not an iPad Pro.
- When exact Stock Present or Low Stock matches exist, the result uses them with no relaxation and no substitution.
- Condition and color removal find nothing, then storage removal finds results. The report names storage only.
- Budget 1000 to 2000 includes devices priced 1000 and 2000. If relaxation reaches the budget, it searches 750 to 2250, then 500 to 2500, then removes the budget. Budget 100 to 300 widens to 0 to 550, then 0 to 800. When promotion-only removal then finds results, the report names promotion only and the budget relaxation.
- Budget bounds 1000.50, -1, or 2000 to 1000 are rejected.
- A device with retail price 1999.50 and no promotion price appears and sorts by that price when the request has no budget. While a budget applies, budget filtering excludes it.
- With promotion only, a device with no supplied promotion price is excluded. An ordinary search includes it.
- When all matches are Out of Stock, the search tries the immediately newer model before the immediately older one, and the result identifies the substitution. When neither works, the original Out of Stock matches remain.
- Twelve matches return ten devices, highest price first by default and lowest price first on request.
- A Stock Present device with no branch says "Online Only". An Out of Stock device shows no stores. A blank branch entry includes the branch and "0" excludes it.
- Quantities "0", "4", and "10" give Out of Stock, Stock Present, and Low Stock.
- A supplied monthly quote appears labelled as monthly, with its supplied value. Supplied checkout and video links appear.
- These outcomes stay distinct: unrecognized description, category not in the catalogue, no match, empty list after price exclusion, initial source failure, and failed refresh. A failed refresh keeps the previous version. A failed initial load never appears as no stock.

## 3. Sale or trade-in value

This tool helps the agent identify the catalogue trade-in value of a customer's device. It is available in Malaysia only. A Philippines deployment does not expose or permit it.

### Requests and results

The tool accepts a device description or an Apple model number. A result lists the matching variants. Each variant shows its model, available specifications, year, and value. The value is a catalogue value, not a binding offer based on inspection. Battery, screen, scratch, and dent information does not cause deductions.

When ten or fewer variants match, the result lists all of them, newest year first, with stable ties. A missing year sorts as zero. When more than ten variants match, the tool asks for a narrower query and does not return a truncated list. The tool has distinct outcomes for an unrecognized description, a category that the tool does not offer, and no matching variant.

An absent price defaults to zero. An explicitly blank price stays blank.

### Matching

Recognition uses the supported device vocabulary and aliases. It distinguishes category, model, storage, size, chipset, generation, connectivity, material, and year. Matching tolerates capitalization, punctuation, extra descriptive words, and minor spelling mistakes. It keeps different numbered models and sibling product lines apart. GB and TB values stay distinct. For an iPad with no other generation or size, "Air 5" means generation and "Pro 11" means size. Recognition covers WiFi or GPS with optional cellular, and the supported material descriptions.

A model-number query matches when the number occurs within the model-number text of a reference row. It takes precedence over the other preferences and can return several variants. Other queries must match the category, the model, and the requested specifications. A request that names only a category does not constrain the model. Specification comparisons ignore capitalization, and a blank specification cell does not exclude a match. The category must match explicitly.

A multiword color takes precedence over material. Natural Titanium is a color and adds no material constraint. Color and condition do not change the value. A used or refurbished description can still identify the device, but it does not create a discount. Valuation does not relax preferences or substitute neighboring models.

### Reference data and failures

Operations supplies a reference file for the market with the deployment. The service loads it at startup. Trade-in feed preparation can run at startup and about every five minutes, and it never overlaps itself. Disabling publication prevents changes to shared sources. A newly prepared feed does not become the serving reference. The replacement reference becomes active only when it is published with the deployment. Preparation keeps model numbers, specifications, and values.

Queries use only a complete published reference. A failure never publishes a partial version. An empty reference is valid. Missing or unusable data is an operational failure, distinct from a genuine no-match result. The serving revision and failures are visible.

### Acceptance cases

- An MY deployment exposes the tool. A PH deployment does not expose it and does not permit a call to it.
- Query "A2172" matches a row whose model-number text is "A2172, A2402". When a model number occurs in two rows, both variants return, even when the request also names other specifications.
- A request for 128GB storage with only 256GB rows gives the no-match outcome, not a 256GB variant or a neighboring model.
- A blank specification cell matches any requested value of that specification.
- Ten matches return all ten. Eleven matches return a request for a narrower query. A variant from 2021 comes before a variant from 2019, and a variant with no year comes last.
- "Black iPhone 12", "used iPhone 12 with a cracked screen", and "iPhone 12" give the same value for the same variant.
- An absent price shows 0. A supplied blank price stays blank. Values show in RM.
- These outcomes stay distinct: unrecognized model, unsupported category, no match, empty reference, and source failure.
- A newly prepared feed does not change the serving reference until the deployment publishes it.

## 4. Promotions

This tool helps the agent explain applicable and near-qualifying offers, with their restrictions and whether they can be combined. It is available in both markets. It does not apply discounts to a purchase.

### Requests and results

The tool accepts an optional model, purchase amount, and purchase date. An omitted date means today in the configured timezone. An omitted amount means 9999. The tool compares the minimum spend with the amount plus 500. An offer listed because of this allowance is not a claim that the customer qualifies at the actual spend.

For each offer, a result shows its name, description, voucher details, eligible models, start and end dates where supplied, combination rules, priority, discount, and minimum spend. A fixed discount uses the market currency. A percentage discount uses a percentage. Discount and minimum-spend values show as whole units, with fractions dropped.

### Eligibility and order

Campaign start and end dates are inclusive. The tool matches a supplied model by its recognized model name, or by the original description when it cannot interpret the model. Matching against model restrictions tolerates extra descriptive words. Similarity alone never makes a base model eligible for a Pro-only offer, and it never confuses different numbered models.

Without a model, the result includes model-restricted campaigns and shows their restrictions. The result shows every applicable offer, including several that cannot be combined. The order puts offers that cannot be combined first, then priority from lowest number to highest, then calculated savings from highest to lowest. Percentage savings use the evaluation amount, which includes the 500 allowance. Listing offers together does not mean they can be combined.

### Campaign data and failures

Operations publishes campaigns through the configured object-storage source. A campaign contains the offer, voucher, fixed or percentage discount, minimum spend, optional dates, eligible models, priority, and combination rules.

The service keeps loaded campaigns for five minutes. After that, queries can use the previous version while a refresh runs. A failed refresh logs the problem and keeps the last loaded version with no maximum stale age, and a later refresh can replace it. A failed initial load is an error. The service loads the source again after a restart. A valid empty campaign file or list means no offers. The tool never presents missing or invalid campaigns as no promotions or as a free offer. The revision, its age, and failures are visible. The tool accepts only complete published versions.

### Acceptance cases

- For minimum spend 3000, amount 2500 includes the offer and amount 2499 does not.
- An omitted amount is evaluated as 9999, and the result does not claim eligibility at the customer's actual spend.
- An offer that runs from 1 March to 31 March appears for 1 March and 31 March, but not for 1 April. The result shows both dates.
- An omitted date uses today in the configured timezone, or in UTC when none is configured. A change of market alone does not change the timezone.
- A base model request does not qualify for an offer restricted to the Pro model of the same number. A request for one numbered model does not qualify for an offer restricted to a different number. A request with extra words, such as storage and color, qualifies for an offer on its model.
- A request without a model includes model-restricted offers and shows their restrictions.
- Offers that cannot be combined come first, then priority 1 before priority 2, then higher savings. For amount 2000, a 10% offer saves 250 and comes before a fixed 200 offer with the same combination rule and priority.
- Two applicable offers that cannot be combined both appear, and the result does not present them as combinable.
- A fixed discount of 150.75 shows as 150 in the market currency. A minimum spend of 2999.99 shows as 2999. Voucher details and model restrictions appear.
- A valid empty source means no offers. An initial source failure reports a failure. A failed refresh keeps the previous version with no stale-age cutoff. A restart loads the source again.

## 5. Store discovery

This tool helps the agent find the nearest store to a location, or list the stores in a state. It is available in both markets.

### Requests and results

The tool accepts a location, a state, or both. Each store in a result shows the store name, address, map link, phone number, and opening hours. The tool applies no repair-capability filter.

The country defaults to the configured market. It gives context to the location search and never selects stores of another market. The tool has distinct outcomes for missing search information, an unrecognized location, no nearby store, no state match, and a location-service failure.

### Search rules

When the request has a location, the location takes precedence. The search uses the first recognized location result. It returns the one nearest store whose straight-line geographical distance is strictly less than 150 km. A store at exactly 150 km does not qualify. Among equally near stores, catalogue order decides. State and country give search context and do not restrict which stores qualify.

With a state only, the result lists all stores whose state matches exactly, ignoring capitalization, in catalogue order. The tool makes no location lookup. State matching uses no aliases, no approximate matching, and no automatic whitespace cleanup.

### Store data and failures

Operations supplies the store reference for the market with the deployment. The service loads it at startup. Addresses, contact details, map links, and opening hours stay as supplied. A replacement reference becomes active when it is published through deployment. An empty market reference never causes a fallback to another market.

A successful location lookup with no result differs from a failure of the external location service. Waits for the location service are bounded. The service logs persistent failures, and unrelated tools stay usable. Missing or unusable store data is an operational failure. The serving revision and problems are visible. An interrupted update never activates a partial reference.

### Acceptance cases

- State "selangor" returns every store with state "Selangor", in catalogue order, and makes no location lookup. State " Selangor" with a leading space, or a misspelled state, gives the no-state-match outcome.
- A request with a location and a state returns the store nearest to the location, even when that store is in a different state.
- When a store is the only candidate, a distance of 149.9 km returns it, and a distance of exactly 150 km gives the no-nearby-store outcome. Of two stores at the same distance, the one earlier in the catalogue is returned. A location search returns one store only.
- A different country context does not load the stores of another market. An empty market reference does not cause a fallback.
- Every store in a result shows its name, address, map link, phone number, and opening hours, as supplied.
- These outcomes stay distinct: missing inputs, unrecognized location, no nearby store, no state match, location-service failure, and unusable reference data. During a location-service failure, the other tools stay usable.
