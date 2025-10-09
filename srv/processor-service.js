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

    // pick incident -> from new to assigned
     // NOOOOOO!!!!! -> @flows
    this.on ('pickIncident', Incidents, async req => {
      let { ID } = req.params[0]
      //check if incident is in new status
      await SELECT.one(Incidents).where({ ID, status_code: 'N' }) || req.reject(400, 'Incident is not in new status')
      await UPDATE(Incidents).set({ status: { code: 'A' } }).where({ ID })
    })
    
    // start processing -> from assigned to in_process
     // NOOOOOO!!!!! -> @flows
    this.on ('startProcessing', Incidents, async req => {
      let { ID } = req.params[0]
      //check if incident is in assigned status
      await SELECT.one(Incidents).where({ ID, status_code: 'A' }) || req.reject(400, 'Incident is not in assigned status')
      await UPDATE(Incidents).set({ status: { code: 'I' } }).where({ ID })
    })
    
    // close incident -> from resolved to closed
     // NOOOOOO!!!!! -> @flows
    this.on ('closeIncident', Incidents, async req => {
      let { ID } = req.params[0]
      //check if incident is in resolved status
      await SELECT.one(Incidents).where({ ID: ID, status_code: 'R' }) || req.reject(400, 'Incident is not in resolved status')
      await UPDATE(Incidents).set({ status: { code: 'C' } }).where({ ID })
    })
  

    //WHAAAT???? -> Where did all my code go???

    return super.init()
  }
}

module.exports = { ProcessorService }
