annotate Books with {

  // manual two-step mandatory constraint
  title @assert: (case
    when title is null  then 'is missing'
    when trim(title)='' then 'must not be empty'
  end);

  // range check
  stock @assert: (case
    when stock <= 0 then 'must not a positive number'
  end);

  // range check
  price @assert: (case
    // when price is not null and not price between 0 and 500 then 'must be between 0 and 500'
    when price <= 0 or price > 500 then 'must be between 0 and 500'
  end);

  genre @assert: (case
    when genre is null then null // genre may be null
    when not exists genre then 'does not exist'
  end);

  // multiple constraints: mandatory + assert target, ...
  author @assert: (case
    when author is null then 'is missing'
    when not exists author then 'does not exist'
  end);
}