const cds = require('@sap/cds')
const { SELECT } = require('@sap/cds/lib/ql/cds-ql')

class ProcessorService extends cds.ApplicationService {
  init() {

    const { Incidents } = this.entities



    //incidents.draft before create fill defaults
    // NOOOOOO!!!!! -> default
    this.before ('CREATE', Incidents.drafts, req => {
      if (!req.data.status) req.data.status = { code: 'N' }
      if (!req.data.urgency) req.data.urgency = { code: 'M' }
    })

    // incident title is mandatory
    // NOOOOOO!!!!! -> @mandatory
    this.before (['CREATE','UPDATE'], Incidents, req => {
      if (!req.data.title || req.data.title.trim().length === 0) {
        req.reject(400, 'Incident title is mandatory')
      }
    })

    //customer name is firstName + ' ' + lastName
    // NOOOOOO!!!!! -> calculated field
    this.after ('READ', 'Incidents', async res => {
      for (let incident of res) {
        if (incident.customer) {
          const customer = await SELECT.one ('Customers') .where ({ ID: incident.customer.ID }) .columns (['firstName','lastName'])
          incident.customer.name = `${customer.firstName} ${customer.lastName}`
        }
      }
    })

    //if title contains 'urgent' set urgency to high
    // NOOOOOO!!!!! -> @assert
    this.before (['CREATE','UPDATE'], Incidents, req => {
      let urgent = req.data.title?.match(/urgent/i)
      if (urgent) req.data.urgency_code = 'H'
    })


    //don't allow modifications of closed incidents
    // NOOOOOO!!!!! -> @flows
    this.before ('UPDATE', Incidents, async req => {
      let closed = await SELECT.one(1) .from (req.subject) .where `status.code = 'C'`
      if (closed) req.reject `Can't modify a closed incident!`
    })

    //WHAAAT???? -> Where did all my code go???

    return super.init()
  }
}

module.exports = { ProcessorService }
