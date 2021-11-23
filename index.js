const { fetchData } = require('./fetchData')

exports.scrapeDataToNightScout = (req, res) => {
    fetchData().then((response) => {
        res.status(200).send('success')
    }).catch((err) => {
        res.status(500).send(err)
    });
}