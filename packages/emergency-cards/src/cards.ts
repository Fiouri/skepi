import type { CardStep, EmergencyCard } from './schema';

/**
 * The bundled cards. Every step is a verbatim excerpt (whole sentences) from the IFRC International
 * First Aid, Resuscitation and Education Guidelines 2025 at the cited printed page; the step numbers of
 * the source are not part of the excerpt. Changing a step means re-running tools/cards-source-check
 * (`pnpm --filter @skepi/cards-source-check check -- --write-lock`) and committing source-check.lock.json.
 */
const step = (section: string, page: number, text: string): CardStep => ({ text, cite: { section, page } });

const CPR = 'Unresponsive and abnormal breathing (adolescent and adult)';
export const cpr: EmergencyCard = {
  id: 'cpr',
  topics: ['cpr', 'drowning'],
  steps: [
    step(CPR, 161, 'Check for a response by gently shaking the person’s shoulders. Speaking loudly and clearly, ask a question such as, “Are you alright?”.'),
    step(CPR, 161, 'Open their airway: Gently tilt their head back and lift the person’s chin. (You may need to turn the person onto their back to do this.)'),
    step(
      CPR,
      161,
      'Check for breathing: Keeping the airway open, look, listen and feel for normal breathing for up to ten seconds. Look for chest or abdominal movement; listen for breath sounds; feel for air on your cheek.',
    ),
    step(
      CPR,
      162,
      'Immediately shout for help and ask bystanders to access EMS. If you are alone, access EMS yourself, either using a telephone with the speaker function or–if there is no phone available nearby–leave the person to access EMS. Do this as quickly as possible.',
    ),
    step(CPR, 162, 'Begin chest compressions without delay; push down on the centre of the person’s chest at a fast and regular rate (100–120 compressions per minute).'),
    step(CPR, 162, 'If able and willing, combine chest compressions with rescue breaths at a ratio of 30:2 (30 compressions followed by two breaths).'),
    step(CPR, 162, 'If the first aider is unable or unwilling to provide rescue breaths, chest compressions alone should be continued.'),
    step(
      CPR,
      162,
      'If one is available, ask a bystander to bring an automated external defibrillator as soon as possible. Follow the voice prompts, interrupting chest compressions as little as possible.',
    ),
    step(
      CPR,
      162,
      'Continue to give chest compressions and breaths unless otherwise instructed to pause (either by an automated defibrillator or professional responder). Pause compressions if the person shows signs of recovery, such as coughing, opening their eyes, speaking or moving purposefully and breathing normally.',
    ),
    step(
      CPR,
      162,
      'If two or more first aid providers are present, alternate giving chest compressions and breaths every two minutes to prevent getting tired. Ensure that there is no interruption in compressions as the next person takes over.',
    ),
  ],
  labels: {
    en: {
      title: 'CPR: unresponsive and not breathing normally (adult)',
      keywords: ['cpr', 'resuscitation', 'cardiac arrest', 'not breathing', 'unconscious', 'unresponsive', 'chest compressions', 'aed', 'defibrillator', 'drowning'],
    },
    el: {
      title: 'ΚΑΡΠΑ: δεν αντιδρά και δεν αναπνέει (ενήλικας)',
      keywords: ['καρπα', 'αναζωογονηση', 'ανακοπη', 'δεν αναπνεει', 'αναισθητος', 'αναισθητη', 'θωρακικες συμπιεσεις', 'απινιδωτης', 'πνιγμος'],
    },
  },
};

const BLEEDING = 'Severe bleeding';
export const bleeding: EmergencyCard = {
  id: 'bleeding',
  topics: ['bleeding'],
  steps: [
    step(BLEEDING, 257, 'Ask the person to apply direct pressure to their injury with their hands.'),
    step(BLEEDING, 257, 'Help the person to lie down.'),
    step(BLEEDING, 257, 'Access EMS.'),
    step(BLEEDING, 257, 'Apply direct pressure to the bleed. If blood soaks through the dressing, apply a second dressing over the first one and apply greater pressure.'),
    step(
      BLEEDING,
      257,
      'If direct pressure is ineffective and the person is bleeding from an arm or leg, consider applying a tourniquet or haemostatic dressing, if available. Continue to put direct pressure on the bleed. In the case that a tourniquet is ineffective, you can add a second tourniquet above the first.',
    ),
    step(
      BLEEDING,
      257,
      'Shock is likely to develop from significant bleeding. Help the person into a comfortable position and keep them warm by wrapping them in clothing or blankets if necessary.',
    ),
    step(BLEEDING, 258, 'If the injured person becomes unresponsive, open their airway and check for breathing after stopping the bleeding.'),
  ],
  labels: {
    en: { title: 'Severe bleeding', keywords: ['bleeding', 'bleed', 'haemorrhage', 'hemorrhage', 'tourniquet', 'wound', 'stop the bleed'] },
    el: { title: 'Σοβαρή αιμορραγία', keywords: ['αιμορραγια', 'αιμορραγει', 'τουρνικε', 'ισχαιμος', 'αιμοστασ'] },
  },
};

const CHOKING = 'Choking';
export const choking: EmergencyCard = {
  id: 'choking',
  topics: ['choking'],
  steps: [
    step(CHOKING, 239, 'Ask the person: “Are you choking?”'),
    step(CHOKING, 240, 'Encourage the person to cough to clear the blockage.'),
    step(CHOKING, 240, 'If the person cannot cough, speak or breathe, give up to five firm blows between their shoulder blades.'),
    step(
      CHOKING,
      240,
      'If the back blows are unsuccessful, give up to five abdominal thrusts by putting your fist between their ribs and their belly button and pulling it sharply inward and upward using the other hand.',
    ),
    step(CHOKING, 240, 'If the abdominal thrusts are unsuccessful, immediately access emergency medical services (EMS).'),
    step(CHOKING, 240, 'Continue alternating between five back blows and five abdominal thrusts until the blockage clears or the person becomes unresponsive.'),
    step(CHOKING, 240, 'If the person becomes unresponsive, give standard CPR.'),
    step(CHOKING, 240, 'Only remove solid material in the airway with your fingers if you can see it. Do not blindly sweep the mouth with your fingers.'),
  ],
  labels: {
    en: {
      title: 'Choking (adult or child)',
      keywords: ['choking', 'choke', 'chokes', 'heimlich', 'abdominal thrust', 'airway obstruction', 'something stuck in throat'],
    },
    el: {
      title: 'Πνιγμονή από ξένο σώμα (ενήλικας ή παιδί)',
      keywords: ['πνιγμονη', 'πνιγεται', 'πνιγηκε', 'ξενο σωμα', 'heimlich', 'χαιμλιχ', 'κοιλιακες ωθησεις', 'ασφυξια'],
    },
  },
};

const BURNS = 'Burns';
export const burns: EmergencyCard = {
  id: 'burns',
  topics: ['burn'],
  steps: [
    step(BURNS, 290, 'Cool the burn with clean running water for at least 10 minutes, ideally 20 minutes.'),
    step(
      BURNS,
      290,
      'Access EMS if the burn is large, deep or close to the face, mouth, throat or genital area, or if it is the result of chemical products, electricity or flames.',
    ),
    step(
      BURNS,
      290,
      'As long as they are not stuck to the skin, remove any clothing and jewellery on or near the burned skin. It will be much harder to remove jewellery once the inflammatory process has set in.',
    ),
    step(BURNS, 290, 'After cooling, cover the wound with a dressing that maintains moisture, contours easily to the wound and is non-stick (e.g.hydrogel).'),
    step(BURNS, 290, 'If necessary, cover the burn with a wet cloth or plastic cling wrap while transporting the person to medical care.'),
    step(
      BURNS,
      290,
      'Reassure the person and monitor their responsiveness, breathing and temperature, especially if it is a child or a vulnerable person (e.g. older adult, person with diabetes).',
    ),
    step(BURNS, 290, 'Do not use ice-cold water, as this may lead to hypothermia, particularly in children or in the case of large burns.'),
    step(BURNS, 290, 'Do not apply ice, as this may aggravate the injury.'),
    step(BURNS, 290, 'If the burn has blisters, leave them intact and seek medical advice.'),
  ],
  labels: {
    en: { title: 'Burns', keywords: ['burn', 'burns', 'burned', 'burnt', 'scald', 'scalded', 'electric shock', 'chemical burn'] },
    el: { title: 'Εγκαύματα', keywords: ['εγκαυμα', 'εγκαυματα', 'καψιμο', 'καηκε', 'ζεματισμα', 'ηλεκτροπληξια', 'χημικο εγκαυμα'] },
  },
};

const FRACTURES = 'Fractures, sprains and strains';
export const fractures: EmergencyCard = {
  id: 'fractures',
  topics: ['fracture'],
  steps: [
    step(FRACTURES, 302, 'Help the person keep the injury still.'),
    step(FRACTURES, 302, 'Support the injury in a comfortable position to prevent any movement. Keeping the limb elevated may help reduce swelling.'),
    step(FRACTURES, 302, 'Apply ice or something cold for up to 20 minutes. Cooling for longer than this may damage the skin. Ask the person to rest.'),
    step(
      FRACTURES,
      302,
      'Access emergency medical services (EMS) if the person has a lot of pain or swelling, signs of shock, the fracture is in the femur or if the limb is in an abnormal position.',
    ),
    step(FRACTURES, 302, 'Reassure the person and ensure they are comfortable.'),
    step(FRACTURES, 302, 'If the injury is an open fracture, your priority is to stop the bleeding and limit infection. As for any fracture, stabilize the limb.'),
    step(FRACTURES, 302, 'Always wrap an icepack in a cloth to avoid damage to the skin.'),
  ],
  labels: {
    en: {
      title: 'Broken bones (fractures)',
      keywords: ['fracture', 'fractured', 'broken bone', 'broken arm', 'broken leg', 'splint', 'sprain', 'dislocation'],
    },
    el: { title: 'Κατάγματα', keywords: ['καταγμα', 'καταγματα', 'ναρθηκας', 'διαστρεμμα', 'εξαρθρημα'] },
  },
};

const HYPOTHERMIA = 'Hypothermia';
export const hypothermia: EmergencyCard = {
  id: 'hypothermia',
  topics: ['hypothermia'],
  steps: [
    step(HYPOTHERMIA, 462, 'Remove the person from the cold or protect them from further cooling.'),
    step(
      HYPOTHERMIA,
      462,
      'Have the person remove any wet clothes (or help them if they are unable to do so). Carefully dry off the person if they are wet. Cover and protect the person from the cold.',
    ),
    step(
      HYPOTHERMIA,
      462,
      'If a person is responsive and shivering, let them warm up using a sleeping bag or a blanket. If they can swallow, give them a warm, sugary drink (e.g. hot chocolate) or some high-energy food.',
    ),
    step(
      HYPOTHERMIA,
      462,
      'If the person is in an altered state of responsiveness and is not shivering, gradually warm them using an electric heating blanket.',
    ),
    step(HYPOTHERMIA, 463, 'Reassure the person and monitor their breathing and level of response.'),
    step(HYPOTHERMIA, 463, 'Do not rub the person’s skin, as this may damage it and the underlying muscles further.'),
    step(HYPOTHERMIA, 463, 'If the person becomes unresponsive, open their airway and check for breathing.'),
    step(HYPOTHERMIA, 463, 'For all cases of hypothermia, the first aid provider should access emergency medical care immediately.'),
  ],
  labels: {
    en: { title: 'Hypothermia (too cold)', keywords: ['hypothermia', 'frostbite', 'too cold', 'freezing', 'shivering', 'cold exposure'] },
    el: { title: 'Υποθερμία (πολύ κρύο)', keywords: ['υποθερμια', 'κρυοπαγημα', 'παγωνει', 'ριγος'] },
  },
};

const HYPERTHERMIA = 'Hyperthermia';
export const heatstroke: EmergencyCard = {
  id: 'heatstroke',
  topics: ['heatstroke'],
  steps: [
    step(
      HYPERTHERMIA,
      448,
      'Advise the person to stop all physical activity immediately. Help them to rest in a cool place and to remove any excess clothing.',
    ),
    step(
      HYPERTHERMIA,
      448,
      'Access EMS immediately. Heatstroke is life-threatening. Be alert to any unusual behaviour (aggressive combativeness or drowsiness) or signs of confusion.',
    ),
    step(HYPERTHERMIA, 448, 'Help the person lie down in a cool place and remove any excess clothing.'),
    step(
      HYPERTHERMIA,
      448,
      'Start cooling the person down immediately. Immerse the person in cold water (1-26° C/33.8-78.8°F) for about 15 minutes, or until their temperature has dropped to less than 39°C (102.2°F).',
    ),
    step(
      HYPERTHERMIA,
      448,
      'If this is not possible (e.g. cold water is unavailable or the person is confused and refuses), cool the person using any other active cooling technique (e.g. place cool, wet sheets or towels on the person or wet them with cold water and place ice packs on their neck and groin areas). Fanning the person will also help cool them down.',
    ),
  ],
  labels: {
    en: { title: 'Heatstroke (severe hyperthermia)', keywords: ['heatstroke', 'heat stroke', 'sunstroke', 'heat exhaustion', 'overheated', 'too hot'] },
    el: { title: 'Θερμοπληξία', keywords: ['θερμοπληξια', 'ηλιαση', 'θερμικη εξαντληση', 'καυσωνας'] },
  },
};

const POISONING = 'Poisoning';
export const poisoning: EmergencyCard = {
  id: 'poisoning',
  topics: ['poisoning'],
  steps: [
    step(POISONING, 348, 'Help the person reduce or stop further exposure to the poison.'),
    step(
      POISONING,
      348,
      'Try to identify the poisonous substance, the amount and when (or how long) the person was exposed to it. Only touch the packaging if it is safe to do so. If not, wait for EMS.',
    ),
    step(
      POISONING,
      348,
      'Access the poison control centre (or local equivalent) or EMS and report all of the information about the poison and situation. Follow their instructions.',
    ),
    step(
      POISONING,
      348,
      'Help the person into a comfortable position on their left side if possible, and monitor them for any change in their breathing or level of response.',
    ),
    step(POISONING, 348, 'Gather any bottles, packages or containers with labels and any other information about the poison to give to EMS.'),
    step(POISONING, 348, 'If the person is unresponsive, open their airway and check for breathing.'),
    step(POISONING, 348, 'If the person vomits while lying on the ground, turn them on their side to prevent choking.'),
  ],
  labels: {
    en: {
      title: 'Poisoning',
      keywords: ['poison', 'poisoning', 'poisoned', 'overdose', 'swallowed', 'toxic', 'fumes', 'carbon monoxide', 'pesticide', 'bleach'],
    },
    el: { title: 'Δηλητηρίαση', keywords: ['δηλητηριαση', 'δηλητηριο', 'υπερδοσολογια', 'τοξικο', 'αναθυμιασεις', 'μονοξειδιο', 'φυτοφαρμακο', 'χλωρινη'] },
  },
};
