using {sap.capire.incidents as my} from '../db/schema';

service ProcessorService {
  entity Incidents as projection on my.Incidents;

  annotate Incidents with {
    @assert: (case
      when title like '%important%' and urgency!='H' then 'important incidents must be high priority'
    end)
    title;
  };

  annotate my.Customers with @cds.autoexpose;
}
