# Real garment fit milestone

The current catalog contains outfit concepts and SVG illustrations. Category links are browsing destinations, not exact SKU matches. Prices are USD estimates. The baseline must not claim LiDAR capture, verified size recommendations, realistic try-on, or infer materials and reviews from names such as “cotton.”

## Required capabilities

- **Capture:** Choose a native capture integration or a validated provider that explicitly supports the target device's depth sensor. A browser camera or animated scan alone does not establish LiDAR support. Detect capability before offering capture, obtain explicit consent, and keep manual measurement entry available. Validate calibration, units, body pose, capture quality, and measurement uncertainty against measured participants across supported body shapes.
- **Garment evidence:** Integrate a licensed retailer feed keyed by exact SKU, variant, region and size. Preserve provenance and retrieval time for prices, stock, brand size charts, garment dimensions, composition, stretch, construction, and customer fit review aggregates. Brand charts alone cannot establish garment ease or drape. Missing evidence must remain visibly unknown.
- **Visualization:** Evaluate a garment simulation/try-on provider using actual body and garment data. Separate an appearance preview from measured fit estimates. Validate predicted tightness, ease and size recommendations against physical fittings before making accuracy claims; include uncertainty and clearly label estimates. A recolored mannequin or generative image cannot validate fit.
- **Privacy:** Before integrating capture, define data minimization, encryption, storage location, retention, deletion and provider terms. Prefer deriving measurements on device and discarding raw scans. Require separate consent before sending body imagery or measurements to a provider; never put raw scans in browser local storage or analytics.

## Delivery gates

1. Ship the polished conversational outfit journey with honest demo metadata and no simulated scan presented as real.
2. Select supported devices/provider, agree data contracts and privacy requirements, and complete an accuracy and feasibility trial using consented test data.
3. Add an optional fit flow only when capture, SKU evidence and validated fitting are available. On unsupported devices, denied consent, incomplete measurements, missing garment data or provider errors, explain the limitation and retain the chat and manual size-guide workflow. Do not fabricate a successful scan or recommendation.

## Official collection references

These destinations were checked on October 17, 2026. Their existence does not verify availability of any demo garment, price, color, composition or customer review:

- [UNIQLO tops](https://www.uniqlo.com/us/en/men/tops), [bottoms](https://www.uniqlo.com/us/en/men/bottoms), [outerwear](https://www.uniqlo.com/us/en/men/outerwear-and-blazers), [accessories](https://www.uniqlo.com/us/en/men/accessories-and-shoes), [shoes](https://www.uniqlo.com/us/en/men/accessories-and-shoes/shoes).
- [UNIQLO shirts and polos](https://www.uniqlo.com/us/en/men/shirts-and-polos), [sweaters and knitwear](https://www.uniqlo.com/us/en/men/sweaters).
- [Levi's men's 501 collection](https://www.levi.com/US/en_US/jeans-by-fit-number/men/jeans/501/c/levi_jeans_by_fit_number_men_jeans_501).
- [adidas Stan Smith collection](https://www.adidas.com/us/stan_smith).
