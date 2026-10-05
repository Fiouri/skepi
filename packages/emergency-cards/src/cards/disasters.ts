import type { EmergencyCard, SourceRef } from '../schema';

const ref = (source: string, locator: string): SourceRef => ({ source, locator });
const DRAFT = { status: 'draft', reviewers: [], date: null } as const;
const WATER = 'cdc-water-emergency';
const QUAKE = 'ready-earthquakes';
const FIRE = 'ready-home-fires';
const FLOOD = 'ready-floods';

export const waterPurification: EmergencyCard = {
  id: 'water-purification',
  topics: [],
  steps: [
    { refs: [ref(WATER, 'Boiling')] },
    { refs: [ref(WATER, 'Boiling')] },
    { refs: [ref(WATER, 'Boiling')] },
    { refs: [ref(WATER, 'Disinfectants; Bleach')] },
    { refs: [ref(WATER, 'Bleach')] },
    { refs: [ref(WATER, 'Bleach')] },
  ],
  whenToCallForHelp: { refs: [ref(WATER, 'Introduction')] },
  locales: {
    en: {
      title: 'Making water safe to drink',
      steps: [
        'If the water is cloudy, first filter it through a clean cloth, paper towel or coffee filter.',
        'Boiling is best: bring clear water to a rolling boil for 1 minute (3 minutes above 6,500 feet, about 2,000 m).',
        'Let the boiled water cool. Store it in clean containers with tight covers.',
        'If you cannot boil it, use unscented household chlorine bleach with 5% to 9% sodium hypochlorite: 8 drops, or a little less than 1/8 teaspoon, per 1 gallon (about 3.8 litres) of water.',
        'If the water is cloudy, murky, coloured or very cold, use double the amount of bleach.',
        'Stir well and let the water stand for at least 30 minutes before you drink it.',
      ],
      whenToCallForHelp: 'Follow the recommendations of your health department on boiling or treating water.',
      keywords: ['water purification', 'purify water', 'drinking water', 'safe water', 'boil water', 'disinfect water', 'bleach water', 'treat water'],
    },
    el: {
      title: 'Πόσιμο νερό: πώς γίνεται ασφαλές',
      steps: [
        'Αν το νερό είναι θολό, φιλτράρετέ το πρώτα με καθαρό πανί, χαρτί κουζίνας ή φίλτρο καφέ.',
        'Το βράσιμο είναι η καλύτερη μέθοδος: φέρτε το καθαρό νερό σε δυνατό βρασμό για 1 λεπτό (3 λεπτά σε υψόμετρο πάνω από 6.500 πόδια, περίπου 2.000 m).',
        'Αφήστε το βρασμένο νερό να κρυώσει. Φυλάξτε το σε καθαρά δοχεία με καπάκι που κλείνει καλά.',
        'Αν δεν μπορείτε να το βράσετε, χρησιμοποιήστε άοσμη οικιακή χλωρίνη με 5% έως 9% υποχλωριώδες νάτριο: 8 σταγόνες, ή λίγο λιγότερο από 1/8 κουταλάκι του γλυκού, ανά 1 γαλόνι (περίπου 3,8 λίτρα) νερού.',
        'Αν το νερό είναι θολό, λασπώδες, χρωματισμένο ή πολύ κρύο, χρησιμοποιήστε διπλάσια ποσότητα χλωρίνης.',
        'Ανακατέψτε καλά και αφήστε το νερό να σταθεί τουλάχιστον 30 λεπτά πριν το πιείτε.',
      ],
      whenToCallForHelp: 'Ακολουθήστε τις συστάσεις των υγειονομικών αρχών για το βράσιμο ή την επεξεργασία του νερού.',
      keywords: ['καθαρισμος νερου', 'ποσιμο νερο', 'βρασιμο νερου', 'απολυμανση νερου', 'χλωρινη νερο', 'ασφαλες νερο'],
    },
  },
  review: DRAFT,
};

export const earthquake: EmergencyCard = {
  id: 'earthquake',
  topics: ['earthquake'],
  steps: [
    { refs: [ref(QUAKE, 'During an earthquake: Drop, Cover, Hold On')] },
    { refs: [ref(QUAKE, 'During an earthquake: Drop, Cover, Hold On')] },
    { refs: [ref(QUAKE, 'During an earthquake: Drop, Cover, Hold On')] },
    { refs: [ref(QUAKE, 'During an earthquake: in bed')] },
    { refs: [ref(QUAKE, 'During an earthquake: outdoors')] },
    { refs: [ref(QUAKE, 'During an earthquake: in a vehicle')] },
    { refs: [ref(QUAKE, 'After an earthquake')] },
    { refs: [ref(QUAKE, 'After an earthquake')] },
    { refs: [ref(QUAKE, 'After an earthquake')] },
  ],
  whenToCallForHelp: { refs: [ref(QUAKE, 'After an earthquake')] },
  locales: {
    en: {
      title: 'Earthquake',
      steps: [
        'Drop where you are onto your hands and knees.',
        'Cover your head and neck with one arm and hand.',
        'Hold on until the shaking stops.',
        'In bed: turn face down and cover your head and neck with a pillow.',
        'Outdoors: stay outside. Move to an open area away from buildings, trees, streetlights and power lines.',
        'In a car: pull over and stop. Set the parking brake.',
        'Expect aftershocks: Drop, Cover and Hold On again. If you are in a damaged building, go outside and move away from it. Do not enter damaged buildings.',
        'If you are trapped, send a text or bang on a pipe or wall.',
        'Use text messages to communicate; they may be more reliable than phone calls.',
      ],
      whenToCallForHelp:
        'After the shaking, watch for leaking gas, damaged buildings and downed power lines. Call the emergency number for injured or trapped people; if calls do not get through, try a text message.',
      keywords: ['earthquake', 'quake', 'aftershock', 'drop cover hold'],
    },
    el: {
      title: 'Σεισμός',
      steps: [
        'Πέστε στο σημείο που βρίσκεστε, στα γόνατα και στα χέρια.',
        'Καλύψτε το κεφάλι και τον αυχένα με το ένα χέρι.',
        'Κρατηθείτε μέχρι να σταματήσει η δόνηση.',
        'Στο κρεβάτι: γυρίστε μπρούμυτα και καλύψτε κεφάλι και αυχένα με ένα μαξιλάρι.',
        'Σε εξωτερικό χώρο: μείνετε έξω. Πηγαίνετε σε ανοιχτό χώρο, μακριά από κτίρια, δέντρα, κολόνες φωτισμού και καλώδια ρεύματος.',
        'Στο αυτοκίνητο: σταθμεύστε στην άκρη και σταματήστε. Τραβήξτε το χειρόφρενο.',
        'Περιμένετε μετασεισμούς: ξανά «Πέσε, Καλύψου, Κρατήσου». Αν είστε σε κτίριο με ζημιές, βγείτε έξω και απομακρυνθείτε. Μην μπαίνετε σε κτίρια με ζημιές.',
        'Αν έχετε εγκλωβιστεί, στείλτε γραπτό μήνυμα ή χτυπήστε έναν σωλήνα ή τον τοίχο.',
        'Επικοινωνείτε με γραπτά μηνύματα· μπορεί να είναι πιο αξιόπιστα από τις κλήσεις.',
      ],
      whenToCallForHelp:
        'Μετά τη δόνηση, προσέξτε για διαρροή αερίου, κτίρια με ζημιές και πεσμένα καλώδια ρεύματος. Καλέστε τον αριθμό έκτακτης ανάγκης για τραυματίες ή εγκλωβισμένους· αν οι κλήσεις δεν περνούν, δοκιμάστε γραπτό μήνυμα.',
      keywords: ['σεισμος', 'σεισμου', 'μετασεισμος', 'πεσε καλυψου κρατησου'],
    },
  },
  review: DRAFT,
};

export const fire: EmergencyCard = {
  id: 'fire',
  topics: ['fire'],
  steps: [
    { refs: [ref(FIRE, 'During a fire')] },
    { refs: [ref(FIRE, 'During a fire')] },
    { refs: [ref(FIRE, 'During a fire')] },
    { refs: [ref(FIRE, 'During a fire: Stop, Drop and Roll')] },
    { refs: [ref(FIRE, 'During a fire')] },
    { refs: [ref(FIRE, 'During a fire: if you cannot get out')] },
  ],
  whenToCallForHelp: { refs: [ref(FIRE, 'During a fire')] },
  locales: {
    en: {
      title: 'Fire at home',
      steps: [
        'Get out of the home quickly and call the emergency number (fire service) from outside.',
        'Drop down to the floor and crawl low, under any smoke, to your exit.',
        'Before opening a door, feel the doorknob and the door. If either is hot, or smoke is coming around the door, leave it closed and use your second way out.',
        'If your clothes catch fire: stop, drop to the ground, cover your face with your hands and roll over until the fire is out.',
        'If you cannot get to someone who needs help, leave the home and tell the fire service where they are.',
        'If you cannot get out: close the door, cover vents and cracks around doors with cloth or tape to keep smoke out, and call the emergency number.',
      ],
      whenToCallForHelp: 'Call the fire service as soon as you are safely outside, or from the room if you are trapped.',
      keywords: ['fire', 'house fire', 'smoke', 'flames', 'burning building', 'wildfire'],
    },
    el: {
      title: 'Φωτιά στο σπίτι',
      steps: [
        'Βγείτε γρήγορα από το σπίτι και καλέστε τον αριθμό έκτακτης ανάγκης (πυροσβεστική) από έξω.',
        'Σκύψτε στο πάτωμα και μπουσουλήστε χαμηλά, κάτω από τον καπνό, ως την έξοδο.',
        'Πριν ανοίξετε μια πόρτα, αγγίξτε το πόμολο και την πόρτα. Αν κάποιο από τα δύο καίει ή βγαίνει καπνός γύρω από την πόρτα, αφήστε την κλειστή και χρησιμοποιήστε τη δεύτερη έξοδο.',
        'Αν πάρουν φωτιά τα ρούχα σας: σταματήστε, πέστε στο έδαφος, καλύψτε το πρόσωπο με τα χέρια και κυλιστείτε μέχρι να σβήσει η φωτιά.',
        'Αν δεν μπορείτε να φτάσετε σε κάποιον που χρειάζεται βοήθεια, βγείτε από το σπίτι και πείτε στην πυροσβεστική πού βρίσκεται.',
        'Αν δεν μπορείτε να βγείτε: κλείστε την πόρτα, καλύψτε αεραγωγούς και χαραμάδες γύρω από τις πόρτες με πανί ή ταινία για να μη μπαίνει καπνός, και καλέστε τον αριθμό έκτακτης ανάγκης.',
      ],
      whenToCallForHelp: 'Καλέστε την πυροσβεστική μόλις βγείτε με ασφάλεια, ή από το δωμάτιο αν έχετε εγκλωβιστεί.',
      keywords: ['φωτια', 'πυρκαγια', 'φλογες', 'καιγεται'],
    },
  },
  review: DRAFT,
};

export const flood: EmergencyCard = {
  id: 'flood',
  topics: ['flood'],
  steps: [
    { refs: [ref(FLOOD, 'During a flood')] },
    { refs: [ref(FLOOD, 'During a flood')] },
    { refs: [ref(FLOOD, 'During a flood')] },
    { refs: [ref(FLOOD, 'During a flood')] },
    { refs: [ref(FLOOD, 'During a flood: trapped in a vehicle')] },
    { refs: [ref(FLOOD, 'During a flood: trapped in a building')] },
    { refs: [ref(FLOOD, 'After a flood')] },
    { refs: [ref(FLOOD, 'After a flood')] },
  ],
  whenToCallForHelp: { refs: [ref(FLOOD, 'During a flood: trapped in a building')] },
  locales: {
    en: {
      title: 'Flood',
      steps: [
        "Do not walk, swim or drive through flood water. Turn around, don't drown!",
        'Just 6 inches (15 cm) of moving water can knock you down, and 1 foot (30 cm) of moving water can sweep your vehicle away.',
        'Evacuate immediately if you are told to.',
        'Stay off bridges over fast-moving water.',
        'Trapped in a car in rapidly moving water: stay inside. If water is rising inside the car, get on the roof.',
        'Trapped in a building: go to the highest level. Go on the roof only if necessary, and signal for help from there.',
        'Return home only when the authorities say it is safe. Avoid flood water: it may be contaminated, hide debris, or be electrically charged by downed power lines.',
        'Use generators only outdoors and away from windows.',
      ],
      whenToCallForHelp: 'Call the emergency number or signal for help if you or others are trapped by rising water.',
      keywords: ['flood', 'flooding', 'flash flood', 'rising water', 'flood water'],
    },
    el: {
      title: 'Πλημμύρα',
      steps: [
        'Μην περπατάτε, μην κολυμπάτε και μην οδηγείτε μέσα σε νερά πλημμύρας. Γυρίστε πίσω!',
        'Μόλις 15 cm (6 ίντσες) νερού σε κίνηση μπορούν να σας ρίξουν κάτω, και 30 cm (1 πόδι) νερού σε κίνηση μπορούν να παρασύρουν το αυτοκίνητό σας.',
        'Εκκενώστε αμέσως αν σας ζητηθεί.',
        'Μένετε μακριά από γέφυρες πάνω από ορμητικά νερά.',
        'Εγκλωβισμένοι σε αυτοκίνητο μέσα σε ορμητικό νερό: μείνετε μέσα. Αν το νερό ανεβαίνει μέσα στο αυτοκίνητο, ανεβείτε στην οροφή.',
        'Εγκλωβισμένοι σε κτίριο: ανεβείτε στο ψηλότερο επίπεδο. Βγείτε στη στέγη μόνο αν χρειαστεί και δώστε σήμα για βοήθεια από εκεί.',
        'Επιστρέψτε σπίτι μόνο όταν οι αρχές πουν ότι είναι ασφαλές. Αποφεύγετε τα νερά της πλημμύρας: μπορεί να είναι μολυσμένα, να κρύβουν συντρίμμια ή να είναι ηλεκτρισμένα από πεσμένα καλώδια.',
        'Χρησιμοποιείτε γεννήτριες μόνο σε εξωτερικό χώρο και μακριά από παράθυρα.',
      ],
      whenToCallForHelp: 'Καλέστε τον αριθμό έκτακτης ανάγκης ή δώστε σήμα για βοήθεια αν εσείς ή άλλοι έχετε εγκλωβιστεί από νερό που ανεβαίνει.',
      keywords: ['πλημμυρα', 'πλημμυρες', 'πλημμυρισε', 'χειμαρρος'],
    },
  },
  review: DRAFT,
};
