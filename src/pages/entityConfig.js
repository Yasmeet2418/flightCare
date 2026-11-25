const statusFlight = ['scheduled', 'on_time', 'delayed', 'cancelled', 'diverted']
const disruptionTypes = ['delay', 'cancellation', 'diversion', 'missed_connection']
const requestTypes = ['accommodation', 'meal', 'transport', 'special_assistance', 'general_enquiry']
const requestStatuses = ['pending', 'in_progress', 'completed', 'cancelled']
const disruptionStatuses = ['active', 'monitoring', 'resolved']
const alternativeStatuses = ['available', 'full', 'cancelled']

const flight = {
  table: 'flights', title: 'Flight management', description: 'Monitor scheduled services and keep flight information up to date.',
  iconName: 'plane', createLabel: 'Add flight',
  columns: [
    { key: 'flight_number', label: 'Flight' }, { key: 'airline', label: 'Airline' },
    { key: 'origin', label: 'Origin' }, { key: 'destination', label: 'Destination' },
    { key: 'scheduled_departure', label: 'Scheduled departure' }, { key: 'gate', label: 'Gate' },
    { key: 'status', label: 'Status', status: true },
  ],
  fields: [
    { key: 'flight_number', label: 'Flight number', required: true }, { key: 'airline', label: 'Airline', required: true },
    { key: 'origin', label: 'Origin airport', required: true }, { key: 'destination', label: 'Destination airport', required: true },
    { key: 'scheduled_departure', label: 'Scheduled departure', type: 'datetime-local', required: true },
    { key: 'estimated_departure', label: 'Estimated departure', type: 'datetime-local' },
    { key: 'gate', label: 'Gate' }, { key: 'status', label: 'Flight status', type: 'select', options: statusFlight, required: true },
  ],
  filters: [{ key: 'airline', label: 'airline' }, { key: 'status', label: 'status', options: statusFlight }],
  searchKeys: ['flight_number', 'airline', 'origin', 'destination'],
}

const disruption = {
  table: 'disruptions', title: 'Disruption management', description: 'Coordinate operational events and track resolution progress.',
  iconName: 'activity', createLabel: 'Record disruption',
  columns: [{ key: 'flight_id', label: 'Affected flight', lookup: 'flights' }, { key: 'type', label: 'Type', status: true }, { key: 'reason', label: 'Reason' }, { key: 'estimated_delay_minutes', label: 'Est. delay', suffix: ' min' }, { key: 'status', label: 'Status', status: true }, { key: 'created_at', label: 'Reported' }],
  fields: [
    { key: 'flight_id', label: 'Affected flight', type: 'lookup', lookup: 'flights', lookupLabel: 'flight_number', required: true },
    { key: 'type', label: 'Disruption type', type: 'select', options: disruptionTypes, required: true },
    { key: 'reason', label: 'Reason', type: 'textarea', required: true },
    { key: 'estimated_delay_minutes', label: 'Estimated delay (minutes)', type: 'number', min: 0 },
    { key: 'status', label: 'Status', type: 'select', options: disruptionStatuses, required: true },
  ],
  filters: [{ key: 'type', label: 'type', options: disruptionTypes }, { key: 'status', label: 'status', options: disruptionStatuses }],
  searchKeys: ['reason', 'type'],
}

const passengerConfig = {
  table: 'passengers', title: 'Passenger management', description: 'Find passenger accounts and review contact and loyalty details.',
  iconName: 'users', createLabel: 'Add passenger',
  columns: [{ key: 'full_name', label: 'Passenger' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'loyalty_number', label: 'Loyalty number' }, { key: 'created_at', label: 'Added' }],
  fields: [{ key: 'full_name', label: 'Full name', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'phone', label: 'Phone' }, { key: 'loyalty_number', label: 'Loyalty number' }],
  searchKeys: ['full_name', 'email', 'phone', 'loyalty_number'],
}

const alternative = {
  table: 'alternative_flights', title: 'Alternative flight management', description: 'Offer eligible rebooking options without issuing tickets or creating bookings.',
  iconName: 'repeat', createLabel: 'Add alternative',
  columns: [{ key: 'flight_number', label: 'Flight' }, { key: 'airline', label: 'Airline' }, { key: 'origin', label: 'Origin' }, { key: 'destination', label: 'Destination' }, { key: 'departure_at', label: 'Departure' }, { key: 'available_seats', label: 'Seats' }, { key: 'status', label: 'Availability', status: true }],
  fields: [
    { key: 'disruption_id', label: 'Linked disruption', type: 'lookup', lookup: 'disruptions', lookupLabel: 'reason' },
    { key: 'flight_number', label: 'Flight number', required: true }, { key: 'airline', label: 'Airline', required: true },
    { key: 'origin', label: 'Origin airport', required: true }, { key: 'destination', label: 'Destination airport', required: true },
    { key: 'departure_at', label: 'Departure', type: 'datetime-local', required: true },
    { key: 'available_seats', label: 'Available seats', type: 'number', min: 0, required: true },
    { key: 'status', label: 'Availability', type: 'select', options: alternativeStatuses, required: true },
  ],
  filters: [{ key: 'status', label: 'availability', options: alternativeStatuses }],
  searchKeys: ['flight_number', 'airline', 'origin', 'destination'],
}

const assistance = {
  table: 'assistance_requests', title: 'Assistance requests', description: 'Prioritize passenger support and keep request owners informed.',
  iconName: 'help', createLabel: 'New request',
  columns: [{ key: 'passenger_id', label: 'Passenger', lookup: 'passengers' }, { key: 'type', label: 'Request type', status: true }, { key: 'subject', label: 'Subject' }, { key: 'status', label: 'Status', status: true }, { key: 'created_at', label: 'Submitted' }, { key: 'internal_notes', label: 'Internal notes' }],
  fields: [
    { key: 'passenger_id', label: 'Passenger', type: 'lookup', lookup: 'passengers', lookupLabel: 'full_name', required: true },
    { key: 'type', label: 'Request type', type: 'select', options: requestTypes, required: true },
    { key: 'subject', label: 'Subject', required: true }, { key: 'details', label: 'Details', type: 'textarea', required: true },
    { key: 'status', label: 'Status', type: 'select', options: requestStatuses, required: true },
    { key: 'internal_notes', label: 'Internal notes', type: 'textarea' },
  ],
  filters: [{ key: 'type', label: 'type', options: requestTypes }, { key: 'status', label: 'status', options: requestStatuses }],
  searchKeys: ['subject', 'details', 'type'],
}

const booking = {
  table: 'bookings', title: 'My bookings', description: 'Your booking records and their linked flight information.',
  iconName: 'briefcase', createLabel: null, passengerOnly: true,
  columns: [{ key: 'booking_reference', label: 'Booking reference' }, { key: 'flight_id', label: 'Flight', lookup: 'flights' }, { key: 'seat', label: 'Seat' }, { key: 'status', label: 'Status', status: true }, { key: 'created_at', label: 'Booked' }],
  fields: [], searchKeys: ['booking_reference', 'seat', 'status'],
}

const notifications = {
  table: 'notifications', title: 'Notifications', description: 'Operational updates and passenger-facing messages.',
  iconName: 'bell', createLabel: 'Create notification', passengerOnly: false,
  columns: [{ key: 'title', label: 'Title' }, { key: 'message', label: 'Message' }, { key: 'type', label: 'Category', status: true }, { key: 'read_at', label: 'Read at' }, { key: 'created_at', label: 'Sent' }],
  fields: [{ key: 'user_id', label: 'Recipient user ID', required: true }, { key: 'title', label: 'Title', required: true }, { key: 'message', label: 'Message', type: 'textarea', required: true }, { key: 'type', label: 'Category', type: 'select', options: ['flight_update', 'disruption', 'assistance', 'general'], required: true }],
  searchKeys: ['title', 'message', 'type'],
}

const staff = {
  table: 'profiles', title: 'Staff management', description: 'Review team access. Role changes are administrator-only and enforced by database policies.',
  iconName: 'shield', createLabel: null, adminOnly: true,
  columns: [{ key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', status: true }, { key: 'created_at', label: 'Joined' }],
  fields: [
    { key: 'full_name', label: 'Full name', required: true },
    { key: 'role', label: 'Role', type: 'select', options: ['admin', 'operations_manager', 'customer_service', 'passenger'], required: true },
  ],
  searchKeys: ['full_name', 'email', 'role'],
}

const myDisruptions = { ...disruption, title: 'My disrupted flights', description: 'Disruptions affecting flights in your bookings.', createLabel: null, passengerOnly: true, fields: [], readOnly: true }
const myAssistance = { ...assistance, title: 'My assistance requests', description: 'Track your support requests and their latest status.', createLabel: 'Request assistance', passengerOnly: true, fields: assistance.fields.filter((field) => field.key !== 'passenger_id' && field.key !== 'internal_notes') }
const myAlternatives = { ...alternative, title: 'Alternative flights', description: 'Available options for your disrupted bookings. Selecting an option records your preference only and does not book a ticket.', createLabel: null, passengerOnly: true, fields: [], selectable: true }
const myNotifications = { ...notifications, title: 'My notifications', description: 'Updates related to your flights and assistance requests.', createLabel: null, passengerOnly: true, fields: [], readOnly: true }

export const entityConfigs = {
  flights: flight,
  disruptions: disruption,
  passengers: passengerConfig,
  alternatives: alternative,
  assistance,
  bookings: booking,
  notifications,
  staff,
  myDisruptions,
  myAssistance,
  myAlternatives,
  myNotifications,
}
