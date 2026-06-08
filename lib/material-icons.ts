// Authoritative category-icon set — must stay in sync with the mobile app's
// `_categoryIconByName` map (services_provider.dart). The backend stores one of
// these exact strings in a category's `iconName`; the mobile app resolves it to
// `Icons.<key>`. Anything not in this list falls back to miscellaneous_services
// on mobile, so the admin picker is restricted to exactly these keys.
//
// IMPORTANT: when adding here, add the matching `'<name>': Icons.<name>,` entry
// to the mobile map too (see docs/category-icons.md), or the app will render the
// fallback. Every name below is a valid Flutter `Icons.<name>`.
export const MATERIAL_ICONS: string[] = [
  // ── Original mobile set (already mapped) ──
  'handyman',
  'car_repair',
  'electrical_services',
  'build_outlined',
  'content_cut',
  'format_paint',
  'home_repair_service_outlined',
  'carpenter',
  'plumbing',
  'satellite_alt',
  'laptop_mac',
  'kitchen',
  'tv',
  'phone_android',
  'ac_unit',
  'cleaning_services',
  'local_shipping',
  'local_florist',
  'pets',
  'brush',
  'lock',
  'water_drop',
  'bolt',
  'wifi',
  'computer',
  'camera_alt',
  'restaurant',
  'spa',
  'miscellaneous_services',

  // ── Expanded set (requires matching mobile map entries) ──
  // Trades, repair & construction
  'construction',
  'engineering',
  'pest_control',
  'roofing',
  'hvac',
  'design_services',
  'architecture',
  'hardware',
  'lightbulb',
  'power',
  'water_damage',
  // Cleaning, laundry & personal care
  'local_laundry_service',
  'dry_cleaning',
  'checkroom',
  'bathtub',
  'soap',
  'shower',
  // Home, furniture & appliances
  'bed',
  'chair',
  'weekend',
  'microwave',
  'blender',
  'coffee_maker',
  'window',
  'fireplace',
  'countertops',
  // Security
  'security',
  'key',
  'doorbell',
  'sensors',
  'videocam',
  'garage',
  // Vehicles & transport
  'directions_car',
  'local_car_wash',
  'directions_bike',
  'two_wheeler',
  'electric_scooter',
  'local_taxi',
  'agriculture',
  // Food & catering
  'fastfood',
  'local_cafe',
  'local_bar',
  'cake',
  'restaurant_menu',
  'bakery_dining',
  'set_meal',
  // Shops & nature
  'store',
  'storefront',
  'shopping_bag',
  'local_grocery_store',
  'local_mall',
  'park',
  'forest',
  // Health & care
  'medical_services',
  'healing',
  'vaccines',
  'child_care',
  'elderly',
  'school',
  'menu_book',
  // Creative, events & media
  'music_note',
  'piano',
  'palette',
  'photo_camera',
  'movie',
  'celebration',
  'event',
  'card_giftcard',
  // Finance & business
  'payments',
  'account_balance',
  'work',
  'business_center',
  'badge',
  'gavel',
  // Comms & support
  'translate',
  'language',
  'support_agent',
  'call',
  'mail',
  // Fitness & sport
  'fitness_center',
  'pool',
  'sports_soccer',
  // Tech
  'print',
  'router',
]

// Some keys (e.g. build_outlined) are outlined variants. On the web the outlined
// glyphs live in a separate "Material Icons Outlined" font whose ligature is the
// BASE name (build_outlined -> ligature "build", class "material-icons-outlined").
const OUTLINED_SUFFIX = '_outlined'

export function iconIsOutlined(name: string): boolean {
  return name.endsWith(OUTLINED_SUFFIX)
}

/** The font-class to render a given iconName on the web. */
export function iconFontClass(name: string): string {
  return iconIsOutlined(name) ? 'material-icons-outlined' : 'material-icons'
}

/** The ligature text the font expects (strips the _outlined suffix). */
export function iconLigature(name: string): string {
  return iconIsOutlined(name) ? name.slice(0, -OUTLINED_SUFFIX.length) : name
}
