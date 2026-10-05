import { stateMapping, isPlaceholder } from "./misx";

/**
 * Parses a full address string to extract City, State, and Pincode.
 * Useful for Indian addresses where everything is often provided in a single line.
 * It also cleans up address_line_1 to remove the extracted parts.
 */
export function parseFullAddress(record: any) {
  if (!record.address_line_1 || typeof record.address_line_1 !== "string") {
    return record;
  }

  let { address_line_1, city, state, pincode } = record;
  let fullStr = address_line_1.trim();

  // 1. Extract Pincode (6 digits)
  // We look for a 6-digit number, often at the end or preceded by a dash
  const pincodeMatch = fullStr.match(/\b\d{6}\b/);
  if (pincodeMatch) {
    const extractedPincode = pincodeMatch[0];
    if (isPlaceholder(pincode)) {
      pincode = extractedPincode;
    }
    // Remove the pincode and any preceding dash/space
    fullStr = fullStr
      .replace(new RegExp(`[-]?\\s*\\b${extractedPincode}\\b`, "g"), "")
      .trim();
  }

  // 2. Extract State
  const stateNames = Object.keys(stateMapping);
  // Sort by length descending to match "Tamil Nadu" before "Tamil"
  const sortedStates = stateNames.sort((a, b) => b.length - a.length);

  let foundStateName = "";
  for (const s of sortedStates) {
    const regex = new RegExp(`\\b${s}\\b`, "i");
    if (regex.test(fullStr)) {
      foundStateName = s;
      if (isPlaceholder(state)) {
        // Format state nicely (e.g., "Tamil Nadu")
        state = s
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
      // Remove state from address_line_1
      fullStr = fullStr.replace(regex, "").trim();
      break;
    }
  }

  // 3. Extract City
  // If city is missing, we look at the remaining string's last segments
  if (isPlaceholder(city)) {
    // Clean up trailing punctuation before splitting
    const tempStr = fullStr.replace(/[,/\-]\s*$/, "").trim();
    const parts = tempStr.split(/[,/\-]\s*/).filter(Boolean);

    if (parts.length > 0) {
      const potentialCity = parts[parts.length - 1].trim();
      // Heuristic: City names are usually between 3 and 50 chars
      if (potentialCity.length >= 3 && potentialCity.length < 50) {
        city = potentialCity;
      }
    }
  }

  // 4. Final Cleanup of address_line_1
  // We want to remove the city name from address_line_1 as well if it's there
  if (!isPlaceholder(city)) {
    const safeCity = String(city).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Remove city if it's a standalone word or at the end
    const cityRegex = new RegExp(`\\b${safeCity}\\b`, "gi");
    fullStr = fullStr.replace(cityRegex, "").trim();
  }

  // Remove redundant separators (e.g., ", , " -> ", ") and trailing/leading punctuation
  address_line_1 = fullStr
    .replace(/[,/\-]\s*[,/\-]/g, ",") // multiple commas
    .replace(/\s*,\s*/g, ", ") // fix spacing around commas
    .replace(/^[,/\-\s]+/, "") // leading symbols
    .replace(/[,/\-\s]+$/, "") // trailing symbols
    .trim();

  return {
    ...record,
    address_line_1,
    city: isPlaceholder(city) ? undefined : city,
    state: isPlaceholder(state) ? undefined : state,
    pincode: isPlaceholder(pincode) ? undefined : pincode,
  };
}
