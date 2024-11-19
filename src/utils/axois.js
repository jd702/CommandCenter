import axios from "axios";
import baseUrl from "./baseURL";

const Axios = axios.create({
  baseURL: baseUrl,
  headers: {
    'Content-Type': 'application/json'
  }
});
export default Axios;
