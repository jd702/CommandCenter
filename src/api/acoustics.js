import Axios from "../utils/axois";

const apiService = {
    async startAudioCaptureAndClassify(data){
        console.log(data)
        return await Axios.post(`results/start`, data,{
            headers: {
                'Content-Type': 'application/json'
            }
        })
    },
    async stopAudioCaptureAndClassify(){
        return await Axios.get(`results/stop`)
    }
}
export default apiService
