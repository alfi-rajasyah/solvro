// Operator options for the filter fields that offer only the affirmative
// operator. The URL-backed filters can express "filtered to these" or "no
// filter", never a negation, so the vendored fields' other operators stay off.
export const IS_OPERATOR = [{ value: "is", label: "is" }];
export const IS_ANY_OF_OPERATOR = [{ value: "is_any_of", label: "is any of" }];
