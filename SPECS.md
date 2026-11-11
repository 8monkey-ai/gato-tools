# Gato tools

## Purpose

The Gato tools service gives agents four independent retail tools through MCP: device availability, sale or trade-in value, promotions, and location lookup. Each tool owns its business rules, data needs, and acceptance cases.

This specification is the source of truth for the required product behavior and architecture, including edge cases. It is the reference for development, acceptance, and future changes. Each present-tense statement specifies required behavior or architecture. It does not report implementation status. A requirement stays in this document after its implementation is complete, and it changes only when the intended behavior changes. `AGENTS.md` gives the contributor rules. `README.md` gives the setup and operating instructions.

## 1. Service and markets

The service is a separate TypeScript service that runs on Bun. It exposes the tools through MCP and reads its source data from files in a mounted data folder. Integration details follow the [MCP documentation](https://modelcontextprotocol.io/docs/getting-started/intro). A failure in one tool does not prevent unrelated tools from operating.

The tools need no conversation history. They do not generate replies, send customer messages, reserve stock, or process purchases or payments. The deployment owns hosting, credentials, releases, the content of the data folder, backups, and restoration.

Each deployment selects one market, the MCP bearer token, the Google Geocoding API key, the data folder, and the timezone:

| Market      | Code | Currency |
| ----------- | ---- | -------- |
| Malaysia    | MY   | RM       |
| Philippines | PH   | PHP      |

Prices, values, and fixed amounts use the currency of the configured market. Dates use UTC unless the deployment configures another timezone. The market selection does not change the timezone.

### Source data

The data folder has one file for each source: stock, the trade-in reference, and campaigns. The deployment keeps the files up to date. The service only reads the folder, and it never writes to it. Each source follows these rules:

- The deployment replaces a file in one step, for example by writing a temporary file and then renaming it. The service never uses a partial version.
- The service loads each file at startup, and again after a restart. A missing or unusable file at startup is a failed initial load. It is an error and never appears as an empty result.
- The service uses a changed file within 10 seconds.
- When a changed file is missing or unusable, the service logs the problem and keeps the last loaded version, with no maximum stale age. A later valid file replaces it.
- An empty source is valid data. Missing or unusable data is an operational failure, distinct from a genuine no-match result.
- The health check shows the serving revision of each source, its age, and the most recent failure.

### MCP interface

The service exposes the tools through MCP over Streamable HTTP. The service is stateless: each request stands alone, and the service keeps no MCP session between requests. Each MCP request carries the configured static bearer token. The service refuses a request with a missing or wrong token, and it runs no tool for that request. Request text, for example a device description or a location, has a bounded length. The service refuses longer text.

### Device matching

Device availability and sale or trade-in value read device descriptions with the same rules.

Recognition:

- A description is recognized when it names a supported category or gives an Apple model number such as "A2172". The categories are iPhone, Apple Watch, iPad, Mac, Pixel, Samsung, HONOR, OPPO, Vivo, PlayStation, Switch, and AirPods.
- Common names and aliases name their category. For example, "Galaxy" names Samsung, "PS5" names PlayStation, "Nintendo" names Switch, and "MacBook", "iMac", and "Mac mini" name Mac.
- A description that names only a category or an alias searches the whole category, for example "iPhone", "Galaxy", or "PS5". A product line is a model: "MacBook" matches MacBook Air and MacBook Pro, but not iMac.

Specifications:

- Matching reads storage, color, condition, size, chipset, connectivity, material, generation, and year apart from the model. For example, "Used iPhone 12 Black 128GB" is the iPhone 12 in used condition, color Black, with 128GB storage.
- GB and TB values stay distinct. Matching does not convert between the units, so 1TB does not match 1024GB. A memory value is not the storage: in "MacBook Pro 16GB RAM 1TB", the storage is 1TB.
- With no other generation or size, a whole number up to 10 after an iPad line is a generation, and another number is a size. For example, "iPad Air 5" is the fifth generation, and "iPad Pro 11" and "iPad Air 12.9" are sizes.
- Used, refurbished, pre-owned, and second-hand mean used condition.
- WiFi or GPS is recognized with optional cellular, for example "WiFi+Cellular" or "GPS cellular". Cellular, LTE, 4G, or 5G alone means cellular capability: WiFi+Cellular, or GPS+Cellular for an Apple Watch.
- A multiword color takes precedence over material, so "Natural Titanium" is a color and adds no material. "Titanium" alone is a material.
- Chipsets such as M2, "M4 Max", and A17 are read only for Apple categories. "Galaxy A15" is a Samsung model, not a chipset.
- Specification comparisons ignore capitalization. A blank catalogue specification does not exclude a match. A color can match a longer catalogue color, for example Black matches Space Black.

Models:

- A catalogue model matches when each of its words is in the description. Extra descriptive words, capitalization, and punctuation do not matter. For example, "used iPhone 12 with a cracked screen" matches iPhone 12.
- Minor spelling mistakes still match when the numbers are the same. For example, "Iphne 15" matches iPhone 15, and "Galaxy Z Fold 7" matches Galaxy Z Fold7. A spelling tolerance never joins different numbers: iPhone 12 does not match iPhone 13.
- Different numbered models and sibling product lines stay apart. For example, iPhone 13 does not match iPhone 13 Pro, iPhone 13 Pro does not match iPhone 13 Pro Max, and iPad Pro does not match iPad Air.
- A family description without a number matches the numbered models of that family, but not a sibling line. For example, "iPad Air" matches iPad Air 5, and "Galaxy Z Fold" matches Galaxy Z Fold7 but not Galaxy Z Flip7.

### Results

All tools follow the same result pattern:

- A result is a JSON object with one list, named after what it holds, for example `devices`, `promotions`, or `locations`. Each entry is a flat object with snake_case field names. A field that the source does not supply is left out.
- A price, a value, or a fixed amount is text with the market currency and the amount as supplied, for example "RM 1500". A monthly quote ends with "/month".
- A negative business outcome, for example no match or an unrecognized description, is a normal result with a short fixed sentence. Each outcome has its own sentence. All sentences use one consistent style: they state the outcome, and where useful, the next step for the agent.
- A source failure or a location-service failure is an MCP error result. Its short message names the failed data or service. It gives no internal details.
- A search that changes the request reports the changes in an `adjustments` object.
- The tool descriptions give the fixed explanations for the agent, for example that a trade-in value is not a binding offer. Results contain only data.
- Tool names, input names, and output field names are a contract with the agent skills. They change only together with the skills.

### Health and logs

- The service has a liveness check and a health check over HTTP. Both need no token.
- The liveness check shows only that the process answers. It does not depend on the sources, so a source failure does not cause a restart.
- The health check is healthy only when each source of the deployment has a loaded version and its most recent load succeeded. Otherwise it is unhealthy and names the failed sources. A later successful load makes it healthy again.
- For each source, the health check shows the source name, the serving revision, its age, and the most recent failure with its time. It shows no credentials, source contents, or customer data.
- An unhealthy service still answers every tool, as the isolation rule above requires.
- Logs are structured, with one JSON event on each line of standard output. Each event has a time, a level, and an event name.
- The service logs startup, the start of service, each source load and load failure with the source and the revision, each tool call with the tool name, the outcome, and the duration, each location-service failure, and shutdown.
- Logs contain no credentials, tokens, or customer request text, for example device descriptions or locations.
- On a stop signal, the service stops accepting requests, lets running requests finish, and then stops.

### Acceptance cases

- When the stock source is unavailable, promotions and location lookup still answer.
- A request with text longer than the limit is refused.
- An MCP request with a missing or wrong bearer token is refused and runs no tool. A tool call with the correct token needs no earlier request or session.
- When each source has loaded, the health check is healthy. When the file of a source is missing or unusable, at startup or after a change, the health check is unhealthy and names the source. The liveness check stays healthy, and the other tools still answer. After a later valid file loads, the health check is healthy again.
- The logs and the health check contain no token, credentials, device descriptions, or locations.
- A PH deployment exposes device availability, promotions, and location lookup only.
- A PH deployment with no timezone setting uses UTC.
- For each source, a missing or unusable file at startup reports a failure. A changed file is in use within 10 seconds. A changed file that is missing or unusable keeps the previous version, with no stale-age cutoff. A restart loads the file again.

## 2. Device availability

This tool helps the agent find a requested device, explain its availability and price, and offer the permitted alternatives when no exact available match exists. It is available in both markets.

### Requests and results

The tool is `check_availability`. It accepts a device description (`model`), and optionally a promotion-only preference (`in_promo`), a budget range (`price_range`, two whole numbers with the lower first, for example "1000-2000"), and a price order (`sort_order`, `desc` or `asc`). When the request names no model, the search covers all eligible stock. A request that gives only a model number does not restrict stock by that number.

A result lists at most ten `devices`. Each device shows its model, relevant specifications, condition, availability, and retail price (`retail_price`). It also shows each supplied promotion price (`promotion_price`), previous-month price (`last_month_price`), bundle price, and payment-plan price. Each bundle and payment-plan price has its own field, named after the plan and its tenure, for example `ansuran_mudah_price_12month_tenure`. A monthly quote is labelled as monthly and is not recalculated. A device includes checkout and video links (`checkout_link`, `video_link`) where the stock data supplies them. When a device has more than one video candidate, different calls can select different videos.

A result includes only devices labelled Stock Present, Low Stock, or Out of Stock. It omits devices with any other stock status. Stores (`available_stores`) appear only for Stock Present and Low Stock devices. If such a device lists no branch, the result says "Online Only". Out of Stock devices show no stores.

The tool has distinct outcomes for an unrecognized description, a recognized category that the catalogue does not contain, and a recognized search with no matches. Each of these differs from the outcome for unavailable or unusable source data.

### Matching

Descriptions follow the device matching rules in section 1.

### Search

The search runs these steps in order:

1. Exact preferences. Matches satisfy the model and the requested specifications. With promotion only, a match needs a supplied promotion price. An ordinary search includes devices with and without a promotion. Budget bounds are inclusive. The tool rejects budget bounds that are not increasing, nonnegative whole numbers, including decimal bounds. Budget filtering uses a whole-number promotion price, otherwise a whole-number retail price. It excludes a row when that selected price cannot be read as a whole number.
2. Relaxation. If step 1 finds nothing, the search removes preferences in this order and stops when it finds results: condition, color, storage, size, chipset, connectivity, budget, promotion only. Before it removes the budget, it widens each end of the budget by 250, then by 250 again, and keeps the lower bound at zero or more. Category, model, generation, year, and material stay fixed in this step.
3. Stock preference. When any matches are Stock Present or Low Stock, only those matches remain. When no match is Stock Present or Low Stock, also when steps 1 and 2 find nothing, the search tries the immediately newer model, then the immediately older one. It uses the same relaxation as step 2 and keeps only Stock Present and Low Stock matches. The next model has the next generation, year, or model number of the request, or of the first match when the request does not give one. For example, iPhone 13 comes after iPhone 12, and the iPad Pro 6th generation comes after the 5th generation. Newer takes precedence when both are available. If neither works, the original Out of Stock matches remain, or the result is the no-match outcome when there were none.
4. Order and limit. The search excludes rows with an unusable retail price. It then sorts by the numeric promotion price where available, otherwise by the retail price. Decimal prices can determine the order. Highest price first is the default. Lowest price first is also supported, with available stock first and stable ties. The result has at most ten devices.

A result identifies a newer or older model substitution (`model_substitution`). The adjustment report (`dropped_filters`) names the preference removal that first produced results, by its input or specification name, and also the budget relaxation when the search attempted it. It does not name earlier removals that produced nothing. When step 4 excludes every remaining row for an unusable retail price, the result is an empty device list. When steps 1 to 3 find nothing, the result is the no-match outcome.

### Stock data

The stock file gives, for each stock row, the category, the model, the supplied specifications, the condition, the quantity, the branch entries in branch order, the prices, and the links. Stock that the file marks explicitly as new has new condition. All other condition entries mean used.

Stock classification compares the source quantity as text. A quantity that sorts after "3" in text order is Stock Present. Otherwise, exactly "0" is Out of Stock and any other value is Low Stock. These are text comparisons, not numeric thresholds. For example, 4 and 30 are Stock Present, while 10, 100, and a blank quantity are Low Stock. A supplied branch entry that is not exactly "0" includes that branch. This includes a blank entry. Results show the branches in branch order.

Stock follows the source data rules in section 1. An empty catalogue is valid.

### Acceptance cases

- "Used iPhone 12 Black 128GB" identifies the iPhone 12 in used condition, color Black, with 128GB storage.
- "iPad Air 5" matches the fifth generation and "iPad Pro 11" matches the 11-inch size. "Natural Titanium" matches as a color, not a material. Black matches Space Black.
- A 1TB request does not match a 1024GB row. A request for iPhone 12 does not match iPhone 13 as an exact match. iPhone 13 can appear only as a newer substitution that the result identifies. A request for "iPad Air" can match a numbered iPad Air but not an iPad Pro.
- When exact Stock Present or Low Stock matches exist, the result uses them with no relaxation and no substitution.
- Condition and color removal find nothing, then storage removal finds results. The report names storage only.
- Budget 1000 to 2000 includes devices priced 1000 and 2000. If relaxation reaches the budget, it searches 750 to 2250, then 500 to 2500, then removes the budget. Budget 100 to 300 widens to 0 to 550, then 0 to 800. When promotion-only removal then finds results, the report names promotion only and the budget relaxation.
- Budget bounds 1000.50, -1, or 2000 to 1000 are rejected.
- A device with retail price 1999.50 and no promotion price appears and sorts by that price when the request has no budget. While a budget applies, budget filtering excludes it.
- With promotion only, a device with no supplied promotion price is excluded. An ordinary search includes it.
- When all matches are Out of Stock, the search tries the immediately newer model before the immediately older one, and the result identifies the substitution. When neither works, the original Out of Stock matches remain.
- When no device matches iPhone 16 and iPhone 17 is in stock, the result gives iPhone 17 as a newer substitution. When neither iPhone 17 nor iPhone 15 is in stock, the result is the no-match outcome.
- Twelve matches return ten devices, highest price first by default and lowest price first on request.
- A Stock Present device with no branch says "Online Only". An Out of Stock device shows no stores. A blank branch entry includes the branch and "0" excludes it.
- Quantities "0", "4", and "10" give Out of Stock, Stock Present, and Low Stock.
- A supplied monthly quote appears labelled as monthly, with its supplied value. Supplied checkout and video links appear.
- These outcomes stay distinct: unrecognized description, category not in the catalogue, no match, empty list after price exclusion, and source failure. An unusable changed file keeps the previous version. A failed initial load never appears as no stock.

## 3. Sale or trade-in value

This tool helps the agent identify the catalogue trade-in value of a customer's device. It is available in Malaysia only. A Philippines deployment does not expose or permit it.

### Requests and results

The tool is `check_sale_or_trade_in_value`. It accepts a device description or an Apple model number (`model`). A result lists the matching variants as `devices`. Each variant shows its model, available specifications, year, and value (`trade_in_price`). The value is a catalogue value, not a binding offer based on inspection. Battery, screen, scratch, and dent information does not cause deductions.

When ten or fewer variants match, the result lists all of them, newest year first, with stable ties. A missing year sorts as zero. When more than ten variants match, the tool asks for a narrower query and does not return a truncated list. The tool has distinct outcomes for an unrecognized description, a category that the tool does not offer, and no matching variant.

An absent price defaults to zero. An explicitly blank price stays blank.

### Matching

Descriptions follow the device matching rules in section 1.

A model-number query matches when the number occurs within the model-number text of a reference row. It takes precedence over the other preferences and can return several variants. Other queries must match the category, the model, and the requested specifications. The category must match explicitly.

Color and condition do not change the value. A used or refurbished description can still identify the device, but it does not create a discount. Valuation does not relax preferences or substitute neighboring models.

### Reference data and failures

The trade-in reference file gives, for each variant of the market, the category, the model, the model numbers, the specifications, the year, and the value. The reference follows the source data rules in section 1.

### Acceptance cases

- An MY deployment exposes the tool. A PH deployment does not expose it and does not permit a call to it.
- Query "A2172" matches a row whose model-number text is "A2172, A2402". When a model number occurs in two rows, both variants return, even when the request also names other specifications.
- A request for 128GB storage with only 256GB rows gives the no-match outcome, not a 256GB variant or a neighboring model.
- A blank specification cell matches any requested value of that specification.
- Ten matches return all ten. Eleven matches return a request for a narrower query. A variant from 2021 comes before a variant from 2019, and a variant with no year comes last.
- "Black iPhone 12", "used iPhone 12 with a cracked screen", and "iPhone 12" give the same value for the same variant.
- An absent price shows 0. A supplied blank price stays blank. Values show in RM.
- These outcomes stay distinct: unrecognized model, unsupported category, no match, empty reference, and source failure.

## 4. Promotions

This tool helps the agent explain applicable and near-qualifying offers, with their restrictions and whether they can be combined. It is available in both markets. It does not apply discounts to a purchase.

### Requests and results

The tool is `check_promotions`. It accepts an optional model (`model`), purchase amount (`purchase_amount`), and purchase date (`purchase_date`). An omitted date means today in the configured timezone. An omitted amount means 9999. The tool compares the minimum spend with the amount plus 500. An offer listed because of this allowance is not a claim that the customer qualifies at the actual spend.

For each offer in `promotions`, a result shows its name, description, voucher details, eligible models, start and end dates where supplied, combination rules (`stackable`), priority, discount, and minimum spend. A fixed discount uses the market currency. A percentage discount uses a percentage. Discount and minimum-spend values show as whole units, with fractions dropped.

### Eligibility and order

Campaign start and end dates are inclusive. The tool matches a supplied model by its recognized model name, or by the original description when it cannot interpret the model. Matching against model restrictions tolerates extra descriptive words. Similarity alone never makes a base model eligible for a Pro-only offer, and it never confuses different numbered models.

Without a model, the result includes model-restricted campaigns and shows their restrictions. The result shows every applicable offer, including several that cannot be combined. The order puts offers that cannot be combined first, then priority from lowest number to highest, then calculated savings from highest to lowest. Percentage savings use the evaluation amount, which includes the 500 allowance. Listing offers together does not mean they can be combined.

### Campaign data and failures

The campaign file lists the campaigns. A campaign contains the offer, voucher, fixed or percentage discount, minimum spend, optional dates, eligible models, priority, and combination rules.

Campaigns follow the source data rules in section 1. A valid empty campaign file or list means no offers. The tool never presents missing or invalid campaigns as no promotions or as a free offer.

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
- A valid empty file means no offers. A missing or unusable file at startup reports a failure. An unusable changed file keeps the previous version, with no stale-age cutoff. A restart loads the file again.

## 5. Location lookup

This tool helps the agent find the geographical coordinates of a place that the customer names, for example to find the nearest store. It is available in both markets. Store data and the choice of a store are not part of this service.

### Requests and results

The tool is `find_location`. It accepts a location (`user_location`), and optionally a state (`state`) and a country (`country`). The country defaults to the country of the configured market. The state and the country give context to the lookup. They do not restrict the result, so a result can be in another state or country.

A result gives one entry in `locations` with the latitude, the longitude, and the formatted address of the first result of the location service. The agent compares these coordinates with the store locations that it knows, to find the nearest store. The tool has distinct outcomes for a missing location, an unrecognized location, and a location-service failure.

### Location service

The tool uses the Google Geocoding API as its location service. A successful lookup with no result is the unrecognized-location outcome. It is distinct from a failure of the location service. Waits for the location service are bounded. The service logs each failure, and unrelated tools stay usable.

### Acceptance cases

- In an MY deployment, "Sunway Pyramid" returns the latitude, the longitude, and the formatted address of the first result. The lookup uses Malaysia as context.
- A request with a state uses the state as context. A result in another state or country still returns.
- A request with a country uses that country as context instead of the market country.
- A missing or blank location gives the missing-location outcome and makes no lookup.
- A lookup with no result gives the unrecognized-location outcome. A failure or a timeout of the location service gives the location-service failure outcome, and the service logs it. During a location-service failure, the other tools stay usable.
