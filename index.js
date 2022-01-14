import {fetchData} from './fetchData.js';

export const scrapeDataToNightScout = (req, res) => {
    fetchData().then((response) => {
        res.status(200).send('success')
    }).catch((err) => {
        res.status(500).send(err)
    });
}

// fetchData().then((response) => {
// }).catch((err) => {
// });