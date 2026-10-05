import type { EmergencyCard, SourceRef } from '../schema';

const ref = (source: string, locator: string): SourceRef => ({ source, locator });
const ATP = 'atp-4-02-11';
const UHA = 'fema-until-help-arrives';
const DRAFT = { status: 'draft', reviewers: [], date: null } as const;

export const cpr: EmergencyCard = {
  id: 'cpr',
  topics: ['cpr', 'drowning'],
  steps: [
    { refs: [ref(UHA, 'Stay Safe, p. 11'), ref(ATP, 'para. 5-37, p. 69')] },
    { refs: [ref('usfa-unresponsive', 'pictograph text'), ref('nhlbi-cardiac-arrest', 'What bystanders should do')] },
    { refs: [ref(ATP, 'para. 6-45 (Position), p. 80')] },
    { refs: [ref(ATP, 'para. 6-45 (Hand Placement), pp. 80–81'), ref('usfa-unresponsive', 'pictograph text')] },
    { refs: [ref(ATP, 'para. 6-45 (Compression Depth, Compression Rate), p. 81')] },
    { refs: [ref(ATP, 'para. 6-45 (Complete Chest Recoil), p. 81')] },
    { refs: [ref(ATP, 'para. 6-45 (Compression to Ventilation Ratio), p. 81'), ref('usfa-unresponsive', 'pictograph text')] },
    { refs: [ref('nhlbi-cardiac-arrest', 'What bystanders should do (AED)')] },
    { refs: [ref(ATP, 'para. 6-45 (Continue until Help Arrives) and 6-47, p. 81')] },
  ],
  whenToCallForHelp: { refs: [ref('usfa-unresponsive', 'pictograph text'), ref(UHA, 'Call 9-1-1, p. 8')] },
  locales: {
    en: {
      title: 'CPR: unresponsive and not breathing (adult)',
      steps: [
        'Make sure the area is safe. Check whether the person responds and is breathing normally.',
        'If they are not breathing, call the emergency number (or have someone call) and ask for an AED (defibrillator) to be brought if one is nearby.',
        'Lay the person on their back on a firm, flat surface. Kneel beside their chest.',
        'Put the heel of one hand on the centre of the chest, between the nipples. Put your other hand on top and clasp your hands.',
        'Push hard and fast: at least 5 cm (2 inches) deep, 100 to 120 compressions per minute (about two per second).',
        'Let the chest come fully back up after each push, without lifting your hands off the chest.',
        'If you are trained in rescue breaths, give 2 breaths after every 30 compressions. If not, keep doing chest compressions only.',
        'When the AED arrives, switch it on and follow its spoken instructions.',
        'Do not stop until professional help takes over, the person starts breathing or moving, or you are too exhausted to continue.',
      ],
      whenToCallForHelp:
        'Call the emergency number at once for anyone who is not breathing or has no pulse. Put the phone on speaker: the operator will tell you what to do.',
      keywords: ['cpr', 'resuscitation', 'cardiac arrest', 'not breathing', 'unconscious', 'unresponsive', 'chest compressions', 'aed', 'defibrillator', 'drowning'],
    },
    el: {
      title: 'ΚΑΡΠΑ: δεν αντιδρά και δεν αναπνέει (ενήλικας)',
      steps: [
        'Βεβαιωθείτε ότι ο χώρος είναι ασφαλής. Ελέγξτε αν το άτομο αντιδρά και αν αναπνέει κανονικά.',
        'Αν δεν αναπνέει, καλέστε τον αριθμό έκτακτης ανάγκης (ή ζητήστε από κάποιον να καλέσει) και ζητήστε να φέρουν απινιδωτή (AED), αν υπάρχει κοντά.',
        'Ξαπλώστε το άτομο ανάσκελα σε σκληρή, επίπεδη επιφάνεια. Γονατίστε δίπλα στο στήθος του.',
        'Βάλτε τη βάση της παλάμης του ενός χεριού στο κέντρο του στήθους, ανάμεσα στις θηλές. Βάλτε το άλλο χέρι από πάνω και πλέξτε τα δάχτυλα.',
        'Πιέστε δυνατά και γρήγορα: βάθος τουλάχιστον 5 cm (2 ίντσες), 100 έως 120 συμπιέσεις το λεπτό (περίπου δύο το δευτερόλεπτο).',
        'Αφήστε το στήθος να επανέλθει πλήρως μετά από κάθε πίεση, χωρίς να σηκώνετε τα χέρια από το στήθος.',
        'Αν έχετε εκπαιδευτεί στις εμφυσήσεις, δώστε 2 εμφυσήσεις μετά από κάθε 30 συμπιέσεις. Αν όχι, συνεχίστε μόνο με θωρακικές συμπιέσεις.',
        'Όταν φτάσει ο απινιδωτής, ανοίξτε τον και ακολουθήστε τις φωνητικές οδηγίες του.',
        'Μη σταματάτε μέχρι να αναλάβουν επαγγελματίες, να αρχίσει το άτομο να αναπνέει ή να κινείται, ή να εξαντληθείτε.',
      ],
      whenToCallForHelp:
        'Καλέστε αμέσως τον αριθμό έκτακτης ανάγκης για όποιον δεν αναπνέει ή δεν έχει σφυγμό. Βάλτε το τηλέφωνο σε ανοιχτή ακρόαση: ο τηλεφωνητής θα σας καθοδηγήσει.',
      keywords: ['καρπα', 'αναζωογονηση', 'ανακοπη', 'δεν αναπνεει', 'αναισθητος', 'αναισθητη', 'θωρακικες συμπιεσεις', 'απινιδωτης', 'πνιγμος'],
    },
  },
  review: DRAFT,
};

export const bleeding: EmergencyCard = {
  id: 'bleeding',
  topics: ['bleeding'],
  steps: [
    { refs: [ref(UHA, 'Call 9-1-1, p. 8; Stay Safe, p. 11')] },
    { refs: [ref('fema-control-bleeding', 'Step 1')] },
    { refs: [ref('fema-control-bleeding', 'Step 2')] },
    { refs: [ref('fema-control-bleeding', 'Step 3')] },
    { refs: [ref('fema-control-bleeding', 'Step 4')] },
    { refs: [ref(ATP, 'para. 7-24, p. 87'), ref(UHA, 'Stop the Bleeding, p. 16')] },
    { refs: [ref(UHA, 'Provide Comfort, p. 20')] },
  ],
  whenToCallForHelp: { refs: [ref(UHA, 'Call 9-1-1, p. 8'), ref('fema-control-bleeding', 'Step 4')] },
  locales: {
    en: {
      title: 'Severe bleeding',
      steps: [
        'Make sure you are safe. Call the emergency number, or have someone call.',
        'Find where the blood is coming from.',
        'If you can, put something between the blood and your hands: gloves, a cloth, a plastic bag.',
        'Press firmly and steadily directly on the bleeding. Push hard to stop or slow it, even if it hurts the injured person.',
        'Keep pressing until emergency medical services arrive.',
        'If firm pressure or a bandage does not stop heavy bleeding from an arm or leg, apply a tourniquet about 5–8 cm (2 to 3 inches) above the wound, never on the wound.',
        'Keep the person warm: cover them and put something between them and the ground.',
      ],
      whenToCallForHelp: 'Always call the emergency number for heavy bleeding. Keep pressure on the wound until help arrives.',
      keywords: ['bleeding', 'bleed', 'haemorrhage', 'hemorrhage', 'tourniquet', 'wound', 'stop the bleed'],
    },
    el: {
      title: 'Σοβαρή αιμορραγία',
      steps: [
        'Βεβαιωθείτε ότι είστε ασφαλείς. Καλέστε τον αριθμό έκτακτης ανάγκης ή ζητήστε από κάποιον να καλέσει.',
        'Βρείτε από πού έρχεται το αίμα.',
        'Αν μπορείτε, βάλτε κάτι ανάμεσα στο αίμα και στα χέρια σας: γάντια, ένα πανί, μια πλαστική σακούλα.',
        'Πιέστε σταθερά και δυνατά απευθείας πάνω στο σημείο της αιμορραγίας, για να τη σταματήσετε ή να την επιβραδύνετε, ακόμη κι αν πονάει τον τραυματία.',
        'Συνεχίστε να πιέζετε μέχρι να φτάσουν οι διασώστες.',
        'Αν η σταθερή πίεση ή ο επίδεσμος δεν σταματούν τη μεγάλη αιμορραγία σε χέρι ή πόδι, βάλτε ίσχαιμο περίδεσμο (τουρνικέ) περίπου 5–8 cm (2 έως 3 ίντσες) πάνω από το τραύμα, ποτέ πάνω στο τραύμα.',
        'Κρατήστε το άτομο ζεστό: σκεπάστε το και βάλτε κάτι ανάμεσα σε αυτό και στο έδαφος.',
      ],
      whenToCallForHelp: 'Καλείτε πάντα τον αριθμό έκτακτης ανάγκης για μεγάλη αιμορραγία. Συνεχίστε την πίεση στο τραύμα μέχρι να έρθει βοήθεια.',
      keywords: ['αιμορραγια', 'αιμορραγει', 'τουρνικε', 'ισχαιμος', 'αιμοστασ'],
    },
  },
  review: DRAFT,
};

export const choking: EmergencyCard = {
  id: 'choking',
  topics: ['choking'],
  steps: [
    { refs: [ref(ATP, 'para. 5-30, p. 66')] },
    { refs: [ref(ATP, 'para. 5-31, p. 67')] },
    { refs: [ref(ATP, 'para. 5-33, p. 67')] },
    { refs: [ref(ATP, 'para. 5-33, p. 67')] },
    { refs: [ref(ATP, 'para. 5-33, pp. 67–68')] },
    { refs: [ref(ATP, 'paras. 5-31 and 5-34, pp. 67–69')] },
    { refs: [ref(ATP, 'paras. 5-36 and 5-39, pp. 69–70')] },
  ],
  whenToCallForHelp: { refs: [ref(ATP, 'paras. 5-31 and 5-36, pp. 67–69')] },
  locales: {
    en: {
      title: 'Choking (adult)',
      steps: [
        'Ask: "Are you choking?" If the person can speak or cough forcefully, encourage them to keep coughing and do not interfere.',
        'If they cannot breathe, speak or cough, or make high-pitched sounds, act now and call for help.',
        'Give five back blows.',
        'Then abdominal thrusts: stand behind the person and wrap your arms around their waist. Make a fist, thumb side against the abdomen in the middle, slightly above the navel and well below the tip of the breastbone. Grasp the fist with your other hand.',
        'Press into the abdomen with quick, separate backward and upward thrusts until the object comes out or the person becomes unresponsive.',
        'For a pregnant or very large person, or one with an abdominal wound, use chest thrusts instead: arms under the armpits, fist on the middle of the breastbone.',
        'If the person becomes unresponsive, call for help, open the airway and remove the object only if you can see it in the mouth. If you are trained, give rescue breaths and continue the thrusts (see the CPR card).',
      ],
      whenToCallForHelp: 'Call the emergency number if the person cannot breathe, speak or cough, or becomes unresponsive.',
      keywords: ['choking', 'choke', 'chokes', 'heimlich', 'abdominal thrust', 'airway obstruction', 'something stuck in throat'],
    },
    el: {
      title: 'Πνιγμονή από ξένο σώμα (ενήλικας)',
      steps: [
        'Ρωτήστε: «Πνίγεστε;» Αν το άτομο μπορεί να μιλήσει ή να βήξει δυνατά, ενθαρρύνετέ το να συνεχίσει να βήχει και μην παρεμβαίνετε.',
        'Αν δεν μπορεί να αναπνεύσει, να μιλήσει ή να βήξει, ή βγάζει οξύ συριγμό, δράστε αμέσως και φωνάξτε για βοήθεια.',
        'Δώστε πέντε χτυπήματα στην πλάτη.',
        'Μετά κοιλιακές ωθήσεις: σταθείτε πίσω από το άτομο και τυλίξτε τα χέρια σας γύρω από τη μέση του. Σχηματίστε γροθιά, με την πλευρά του αντίχειρα στη μέση της κοιλιάς, λίγο πάνω από τον αφαλό και αρκετά κάτω από την άκρη του στέρνου. Πιάστε τη γροθιά με το άλλο χέρι.',
        'Πιέστε την κοιλιά με γρήγορες, ξεχωριστές ωθήσεις προς τα μέσα και προς τα πάνω, μέχρι να βγει το αντικείμενο ή να χάσει τις αισθήσεις του το άτομο.',
        'Σε έγκυο, πολύ μεγαλόσωμο άτομο ή άτομο με τραύμα στην κοιλιά, κάντε θωρακικές ωθήσεις: χέρια κάτω από τις μασχάλες, γροθιά στη μέση του στέρνου.',
        'Αν το άτομο χάσει τις αισθήσεις του, φωνάξτε για βοήθεια, ανοίξτε τον αεραγωγό και αφαιρέστε το αντικείμενο μόνο αν το βλέπετε στο στόμα. Αν έχετε εκπαιδευτεί, δώστε εμφυσήσεις και συνεχίστε τις ωθήσεις (δείτε την κάρτα ΚΑΡΠΑ).',
      ],
      whenToCallForHelp: 'Καλέστε τον αριθμό έκτακτης ανάγκης αν το άτομο δεν μπορεί να αναπνεύσει, να μιλήσει ή να βήξει, ή αν χάσει τις αισθήσεις του.',
      keywords: ['πνιγμονη', 'πνιγεται', 'πνιγηκε', 'ξενο σωμα', 'heimlich', 'χαιμλιχ', 'κοιλιακες ωθησεις', 'ασφυξια'],
    },
  },
  review: DRAFT,
};

export const burns: EmergencyCard = {
  id: 'burns',
  topics: ['burn'],
  steps: [
    { refs: [ref(ATP, 'paras. 12-9 and 12-11, p. 117')] },
    { refs: [ref(ATP, 'para. 12-10, p. 117')] },
    { refs: [ref('ready-burns', 'Treating minor burns'), ref(ATP, 'para. 12-11 (caution), p. 117')] },
    { refs: [ref('ready-burns', 'Treating minor burns')] },
    { refs: [ref(ATP, 'para. 12-12, p. 118')] },
    { refs: [ref('ready-burns', 'Treating minor burns')] },
    { refs: [ref(ATP, 'paras. 12-15 and 12-20, p. 118')] },
  ],
  whenToCallForHelp: { refs: [ref('ready-burns', 'When to call 911 or go to the hospital')] },
  locales: {
    en: {
      title: 'Burns',
      steps: [
        'Stop the burning: move the person away from the source and put out any flames.',
        'Electrical burn: switch off the power first. Do not touch the person or the source with bare hands; if you cannot switch it off, move the person away with dry wood, rope or clothing.',
        'Remove clothing, jewellery and metal from the burned area, but leave any clothing that is stuck to the burn.',
        'Hold the burn under cool running water for 10 to 15 minutes. Use cool water, not cold water or ice.',
        'Chemical burn: carefully brush off dry chemicals with a clean, dry cloth, then flush with plenty of flowing water.',
        'Do not break blisters. Do not put cream, lotion, oil, butter or egg white on the burn.',
        'Cover the burn with a clean cloth and keep the person warm and off the ground.',
      ],
      whenToCallForHelp:
        'Call the emergency number or go to hospital if the burn comes from fire, electricity or chemicals, is larger than 5 cm (2 inches), looks dark red and glossy with blisters, or shows signs of infection.',
      keywords: ['burn', 'burns', 'burned', 'burnt', 'scald', 'scalded', 'electric shock', 'chemical burn'],
    },
    el: {
      title: 'Εγκαύματα',
      steps: [
        'Σταματήστε το κάψιμο: απομακρύνετε το άτομο από την πηγή και σβήστε τυχόν φλόγες.',
        'Ηλεκτρικό έγκαυμα: κλείστε πρώτα το ρεύμα. Μην αγγίζετε το άτομο ή την πηγή με γυμνά χέρια· αν δεν μπορείτε να κλείσετε το ρεύμα, απομακρύνετε το άτομο με στεγνό ξύλο, σχοινί ή ρούχο.',
        'Αφαιρέστε ρούχα, κοσμήματα και μεταλλικά αντικείμενα από την καμένη περιοχή, αλλά αφήστε όποιο ρούχο έχει κολλήσει στο έγκαυμα.',
        'Κρατήστε το έγκαυμα κάτω από δροσερό τρεχούμενο νερό για 10 έως 15 λεπτά. Χρησιμοποιήστε δροσερό νερό, όχι κρύο νερό ή πάγο.',
        'Χημικό έγκαυμα: απομακρύνετε προσεκτικά τις ξηρές χημικές ουσίες με καθαρό, στεγνό πανί και μετά ξεπλύνετε με άφθονο τρεχούμενο νερό.',
        'Μη σπάτε τις φουσκάλες. Μη βάζετε κρέμα, λοσιόν, λάδι, βούτυρο ή ασπράδι αβγού στο έγκαυμα.',
        'Σκεπάστε το έγκαυμα με καθαρό πανί και κρατήστε το άτομο ζεστό και μακριά από το έδαφος.',
      ],
      whenToCallForHelp:
        'Καλέστε τον αριθμό έκτακτης ανάγκης ή πηγαίνετε στο νοσοκομείο αν το έγκαυμα προέρχεται από φωτιά, ηλεκτρισμό ή χημικά, είναι μεγαλύτερο από 5 cm (2 ίντσες), είναι σκούρο κόκκινο και γυαλιστερό με φουσκάλες, ή δείχνει σημάδια μόλυνσης.',
      keywords: ['εγκαυμα', 'εγκαυματα', 'καψιμο', 'καηκε', 'ζεματισμα', 'ηλεκτροπληξια', 'χημικο εγκαυμα'],
    },
  },
  review: DRAFT,
};

export const fractures: EmergencyCard = {
  id: 'fractures',
  topics: ['fracture'],
  steps: [
    { refs: [ref(ATP, 'para. 13-15, p. 123')] },
    { refs: [ref(ATP, 'para. 13-15, p. 123'), ref('fema-control-bleeding', 'Steps 1–4')] },
    { refs: [ref(ATP, 'para. 13-18, p. 123')] },
    { refs: [ref(ATP, 'paras. 13-13 and 13-19, p. 123; figure 13-25, p. 135')] },
    { refs: [ref(ATP, 'paras. 13-13, 13-16 and 13-17, p. 123')] },
    { refs: [ref(ATP, 'para. 13-14, p. 123')] },
    { refs: [ref(ATP, 'para. 13-13, p. 123')] },
  ],
  whenToCallForHelp: { refs: [ref(ATP, 'paras. 13-12 and 13-18, p. 123')] },
  locales: {
    en: {
      title: 'Broken bones (fractures)',
      steps: [
        'Do not try to straighten the limb, and move the injured part as little as possible.',
        'Stop any bleeding first (see the bleeding card). Do not splint over a wound that has not been treated.',
        'Check the pulse and the feeling below the injury. Coolness, numbness or no pulse are signs of poor circulation.',
        'Splint the limb in a normal resting position: use a board, sticks, a rolled blanket, or the uninjured leg. Include the joints above and below the break.',
        'Pad the splint and tie it with belts, cloth strips or tape, but never directly over the break.',
        'Check that it is not too tight. If fingers or toes become numb, tingle, hurt more, or turn pale or bluish, loosen it.',
        'Support a broken arm in a sling, or pin the shirt sleeve to the shirt.',
      ],
      whenToCallForHelp:
        'Every suspected fracture needs medical care. Call the emergency number at once if the limb below the injury is cold, numb or has no pulse, or if there is heavy bleeding.',
      keywords: ['fracture', 'fractured', 'broken bone', 'broken arm', 'broken leg', 'splint', 'sprain', 'dislocation'],
    },
    el: {
      title: 'Κατάγματα',
      steps: [
        'Μην προσπαθήσετε να ισιώσετε το άκρο και κουνάτε το τραυματισμένο σημείο όσο το δυνατόν λιγότερο.',
        'Σταματήστε πρώτα κάθε αιμορραγία (δείτε την κάρτα αιμορραγίας). Μη βάζετε νάρθηκα πάνω από τραύμα που δεν έχει περιποιηθεί.',
        'Ελέγξτε τον σφυγμό και την αίσθηση κάτω από τον τραυματισμό. Κρύο δέρμα, μούδιασμα ή απουσία σφυγμού δείχνουν κακή κυκλοφορία.',
        'Ακινητοποιήστε το άκρο σε φυσική θέση ανάπαυσης με νάρθηκα: σανίδα, ξύλα, τυλιγμένη κουβέρτα ή το υγιές πόδι. Συμπεριλάβετε τις αρθρώσεις πάνω και κάτω από το κάταγμα.',
        'Βάλτε μαλακό υλικό στον νάρθηκα και δέστε τον με ζώνες, λωρίδες υφάσματος ή ταινία, ποτέ όμως ακριβώς πάνω στο κάταγμα.',
        'Ελέγξτε ότι δεν είναι πολύ σφιχτός. Αν τα δάχτυλα μουδιάσουν, μυρμηγκιάσουν, πονάνε περισσότερο ή γίνουν χλωμά ή μελανά, χαλαρώστε τον.',
        'Στηρίξτε ένα σπασμένο χέρι με αναρτήρα (κρεμαστάρι) ή καρφιτσώστε το μανίκι στο πουκάμισο.',
      ],
      whenToCallForHelp:
        'Κάθε πιθανό κάταγμα χρειάζεται ιατρική φροντίδα. Καλέστε αμέσως τον αριθμό έκτακτης ανάγκης αν το άκρο κάτω από τον τραυματισμό είναι κρύο, μουδιασμένο ή χωρίς σφυγμό, ή αν υπάρχει μεγάλη αιμορραγία.',
      keywords: ['καταγμα', 'καταγματα', 'ναρθηκας', 'διαστρεμμα', 'εξαρθρημα'],
    },
  },
  review: DRAFT,
};

export const hypothermia: EmergencyCard = {
  id: 'hypothermia',
  topics: ['hypothermia'],
  steps: [
    { refs: [ref('cdc-hypothermia', 'Warning signs (adults)')] },
    { refs: [ref('cdc-hypothermia', 'What to do')] },
    { refs: [ref('cdc-hypothermia', 'What to do')] },
    { refs: [ref('cdc-hypothermia', 'What to do')] },
    { refs: [ref(ATP, 'paras. 8-24 and 8-26, p. 92')] },
    { refs: [ref('cdc-hypothermia', 'What to do')] },
    { refs: [ref(ATP, 'para. 17-31, p. 178')] },
    { refs: [ref('cdc-hypothermia', 'What to do')] },
    { refs: [ref('cdc-hypothermia', 'What to do')] },
  ],
  whenToCallForHelp: { refs: [ref('cdc-hypothermia', 'Warning signs; What to do')] },
  locales: {
    en: {
      title: 'Hypothermia (too cold)',
      steps: [
        'Warning signs: shivering, exhaustion or feeling very tired, confusion, fumbling hands, memory loss, slurred speech, drowsiness.',
        'Get the person into a warm room or shelter.',
        'Remove any wet clothing.',
        'Warm the centre of the body first (chest, neck, head and groin), with an electric blanket if available, or with skin-to-skin contact under loose, dry layers of blankets, clothing or towels.',
        'Put something between the person and the cold ground.',
        'If the person is conscious, give warm drinks, never alcohol. Never give drinks to an unconscious person.',
        'Handle the person gently.',
        'Once body temperature has risen, keep the person dry and wrapped in a warm blanket, including the head and neck.',
        'If there is no breathing or pulse, start CPR, even if the person appears dead, and continue until they respond or medical help arrives.',
      ],
      whenToCallForHelp: 'Get medical attention as soon as possible, and immediately if body temperature is below 35 °C (95 °F).',
      keywords: ['hypothermia', 'frostbite', 'too cold', 'freezing', 'shivering', 'cold exposure'],
    },
    el: {
      title: 'Υποθερμία (πολύ κρύο)',
      steps: [
        'Προειδοποιητικά σημάδια: ρίγος, εξάντληση ή μεγάλη κούραση, σύγχυση, αδέξια χέρια, απώλεια μνήμης, δυσκολία στην ομιλία, υπνηλία.',
        'Μεταφέρετε το άτομο σε ζεστό δωμάτιο ή καταφύγιο.',
        'Αφαιρέστε όλα τα βρεγμένα ρούχα.',
        'Ζεστάνετε πρώτα το κέντρο του σώματος (στήθος, λαιμό, κεφάλι και βουβωνική χώρα), με ηλεκτρική κουβέρτα αν υπάρχει, ή με επαφή δέρμα με δέρμα κάτω από χαλαρά, στεγνά στρώματα από κουβέρτες, ρούχα ή πετσέτες.',
        'Βάλτε κάτι ανάμεσα στο άτομο και στο κρύο έδαφος.',
        'Αν το άτομο έχει τις αισθήσεις του, δώστε ζεστά ροφήματα, ποτέ αλκοόλ. Ποτέ μη δίνετε υγρά σε άτομο χωρίς αισθήσεις.',
        'Χειριστείτε το άτομο απαλά.',
        'Όταν ανέβει η θερμοκρασία του σώματος, κρατήστε το άτομο στεγνό και τυλιγμένο σε ζεστή κουβέρτα, μαζί με το κεφάλι και τον λαιμό.',
        'Αν δεν αναπνέει ή δεν έχει σφυγμό, ξεκινήστε ΚΑΡΠΑ, ακόμη κι αν φαίνεται νεκρό, και συνεχίστε μέχρι να αντιδράσει ή να φτάσει ιατρική βοήθεια.',
      ],
      whenToCallForHelp: 'Ζητήστε ιατρική βοήθεια το συντομότερο, και αμέσως αν η θερμοκρασία του σώματος είναι κάτω από 35 °C (95 °F).',
      keywords: ['υποθερμια', 'κρυοπαγημα', 'παγωνει', 'ριγος'],
    },
  },
  review: DRAFT,
};

export const heatstroke: EmergencyCard = {
  id: 'heatstroke',
  topics: ['heatstroke'],
  steps: [
    { refs: [ref(ATP, 'para. 17-14, p. 175')] },
    { refs: [ref(ATP, 'para. 17-15, p. 175')] },
    { refs: [ref(ATP, 'para. 17-15, p. 175')] },
    { refs: [ref(ATP, 'para. 17-15, pp. 175–176')] },
    { refs: [ref(ATP, 'para. 17-10, p. 175')] },
    { refs: [ref(ATP, 'para. 17-15, pp. 175–176')] },
    { refs: [ref(ATP, 'paras. 17-9 and 17-10, pp. 174–175')] },
  ],
  whenToCallForHelp: { refs: [ref(ATP, 'paras. 17-11 and 17-15, p. 175')] },
  locales: {
    en: {
      title: 'Heat stroke',
      steps: [
        'Signs of heat stroke: confusion, headache, dizziness or fainting, nausea or vomiting, hot dry skin, very high body temperature (above 40 °C / 104 °F), fast strong heartbeat, seizures.',
        'Call the emergency number immediately.',
        'Move the person to a cooler place: shade or an air-conditioned room.',
        'Cool them as fast as possible: immerse them in cold water if you can, or apply cold water with wet towels or sponges, and fan them while misting with cool water.',
        'Loosen or remove tight or unnecessary clothing.',
        'Watch their breathing, pulse and responsiveness. If they stop breathing and you cannot find a pulse, start CPR if you are trained.',
        'Heat exhaustion (heavy sweating, weakness, pale, cool or clammy skin): rest in the shade with legs slightly raised and sip cool water or a sports drink. Get medical help if they are not better within 30 minutes or get worse.',
      ],
      whenToCallForHelp:
        'Heat stroke is a medical emergency: call the emergency number at once, and also if heat exhaustion gets worse or the person becomes confused or loses consciousness.',
      keywords: ['heatstroke', 'heat stroke', 'sunstroke', 'heat exhaustion', 'overheated', 'too hot'],
    },
    el: {
      title: 'Θερμοπληξία',
      steps: [
        'Σημάδια θερμοπληξίας: σύγχυση, πονοκέφαλος, ζάλη ή λιποθυμία, ναυτία ή έμετος, ζεστό ξηρό δέρμα, πολύ υψηλή θερμοκρασία σώματος (πάνω από 40 °C / 104 °F), γρήγορος και δυνατός σφυγμός, σπασμοί.',
        'Καλέστε αμέσως τον αριθμό έκτακτης ανάγκης.',
        'Μεταφέρετε το άτομο σε πιο δροσερό μέρος: σκιά ή κλιματιζόμενο χώρο.',
        'Δροσίστε το όσο πιο γρήγορα γίνεται: βυθίστε το σε κρύο νερό αν μπορείτε, ή βάλτε κρύο νερό με βρεγμένες πετσέτες ή σφουγγάρια, και κάντε του αέρα ενώ το ψεκάζετε με δροσερό νερό.',
        'Χαλαρώστε ή αφαιρέστε σφιχτά ή περιττά ρούχα.',
        'Παρακολουθείτε την αναπνοή, τον σφυγμό και αν αντιδρά. Αν σταματήσει να αναπνέει και δεν βρίσκετε σφυγμό, ξεκινήστε ΚΑΡΠΑ αν έχετε εκπαιδευτεί.',
        'Θερμική εξάντληση (έντονη εφίδρωση, αδυναμία, χλωμό, δροσερό ή υγρό δέρμα): ξεκούραση στη σκιά με τα πόδια λίγο ψηλά και γουλιές δροσερό νερό ή ισοτονικό ποτό. Ζητήστε ιατρική βοήθεια αν δεν βελτιωθεί μέσα σε 30 λεπτά ή αν χειροτερέψει.',
      ],
      whenToCallForHelp:
        'Η θερμοπληξία είναι επείγουσα κατάσταση: καλέστε αμέσως τον αριθμό έκτακτης ανάγκης, και επίσης αν η θερμική εξάντληση χειροτερεύει ή το άτομο πάθει σύγχυση ή χάσει τις αισθήσεις του.',
      keywords: ['θερμοπληξια', 'ηλιαση', 'θερμικη εξαντληση', 'καυσωνας'],
    },
  },
  review: DRAFT,
};

export const poisoning: EmergencyCard = {
  id: 'poisoning',
  topics: ['poisoning'],
  steps: [
    { refs: [ref('epa-pesticide-first-aid', 'Emergency contact')] },
    { refs: [ref('epa-pesticide-first-aid', 'Emergency contact; Additional resources (product label)')] },
    { refs: [ref('epa-pesticide-first-aid', 'Swallowed poison')] },
    { refs: [ref('epa-pesticide-first-aid', 'Poison on skin')] },
    { refs: [ref('epa-pesticide-first-aid', 'Poison in eye')] },
    { refs: [ref('epa-pesticide-first-aid', 'Inhaled poison')] },
    { refs: [ref('epa-pesticide-first-aid', 'Inhaled poison')] },
  ],
  whenToCallForHelp: { refs: [ref('epa-pesticide-first-aid', 'Emergency contact')] },
  locales: {
    en: {
      title: 'Poisoning',
      steps: [
        'Call the emergency number at once if the person is unconscious, has trouble breathing or has seizures (convulsions).',
        'Otherwise call a poison information centre for advice. Keep the product container or label with you and read its first-aid directions.',
        'Do not make the person vomit unless the poison centre, the emergency operator or the product label tells you to.',
        'Poison on the skin: remove contaminated clothing, drench the area with water, then wash skin and hair thoroughly with soap and water.',
        'Poison in the eye: hold the eyelid open and rinse gently with clean running water for at least 15 minutes.',
        'Inhaled poison (fumes, gas): get the person to fresh air immediately if you can do so safely, and open doors and windows.',
        'If breathing stops, give rescue breaths or CPR and call for help.',
      ],
      whenToCallForHelp: 'Call the emergency number for unconsciousness, trouble breathing or seizures. For everything else, call a poison information centre.',
      keywords: ['poison', 'poisoning', 'poisoned', 'overdose', 'swallowed', 'toxic', 'fumes', 'carbon monoxide', 'pesticide', 'bleach'],
    },
    el: {
      title: 'Δηλητηρίαση',
      steps: [
        'Καλέστε αμέσως τον αριθμό έκτακτης ανάγκης αν το άτομο δεν έχει τις αισθήσεις του, δυσκολεύεται να αναπνεύσει ή έχει σπασμούς.',
        'Διαφορετικά, καλέστε ένα κέντρο δηλητηριάσεων για οδηγίες. Έχετε μαζί σας τη συσκευασία ή την ετικέτα του προϊόντος και διαβάστε τις οδηγίες πρώτων βοηθειών της.',
        'Μην προκαλείτε έμετο, εκτός αν σας το πει το κέντρο δηλητηριάσεων, ο τηλεφωνητής έκτακτης ανάγκης ή η ετικέτα του προϊόντος.',
        'Δηλητήριο στο δέρμα: αφαιρέστε τα μολυσμένα ρούχα, ρίξτε άφθονο νερό στην περιοχή και μετά πλύνετε καλά δέρμα και μαλλιά με σαπούνι και νερό.',
        'Δηλητήριο στο μάτι: κρατήστε το βλέφαρο ανοιχτό και ξεπλύνετε απαλά με καθαρό τρεχούμενο νερό για τουλάχιστον 15 λεπτά.',
        'Εισπνοή δηλητηρίου (αναθυμιάσεις, αέριο): μεταφέρετε αμέσως το άτομο στον καθαρό αέρα αν μπορείτε να το κάνετε με ασφάλεια, και ανοίξτε πόρτες και παράθυρα.',
        'Αν σταματήσει η αναπνοή, κάντε εμφυσήσεις ή ΚΑΡΠΑ και φωνάξτε για βοήθεια.',
      ],
      whenToCallForHelp:
        'Καλέστε τον αριθμό έκτακτης ανάγκης για απώλεια αισθήσεων, δυσκολία στην αναπνοή ή σπασμούς. Για οτιδήποτε άλλο, καλέστε ένα κέντρο δηλητηριάσεων.',
      keywords: ['δηλητηριαση', 'δηλητηριο', 'υπερδοσολογια', 'τοξικο', 'αναθυμιασεις', 'μονοξειδιο', 'φυτοφαρμακο', 'χλωρινη'],
    },
  },
  review: DRAFT,
};
