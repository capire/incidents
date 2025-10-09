using { sap.capire.incidents as my } from '../db/schema';

service ProcessorService {
  entity Incidents as projection on my.Incidents actions {
    //@from: #new @to: #assigned
    action pickIncident();
    //@from: #assigned @to: #in_process
    action startProcessing();
    //@from: #resolved @to: #closed
    action closeIncident();
  }
  annotate my.Customers with @cds.autoexpose;
}
