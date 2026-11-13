let masterPin = '';

/** The master PIN once entered, kept in memory for this app session only. */
export const getSessionPin = () => masterPin;
export const setSessionPin = (pin: string) => {
  masterPin = pin;
};
