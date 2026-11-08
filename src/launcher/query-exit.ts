/**
 * Closes the launcher's list as soon as its text asks for another screen. It waits for the keypress
 * to finish, because this is called while clack is still handling it. Only once, because pasted
 * text changes the query many times in one go, and a second close would land on the new screen.
 */
export const createQueryExit = (
  close: () => void,
  leavesList: (query: string) => boolean,
): ((query: string) => void) => {
  let isLeaving = false;
  return (query) => {
    if (!isLeaving && leavesList(query)) {
      isLeaving = true;
      setImmediate(close);
    }
  };
};
