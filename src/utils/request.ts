export const getServerTime = () => {
  return fetch("http://127.0.0.1:3000/getServerTime").then((res) => res.json());
};
