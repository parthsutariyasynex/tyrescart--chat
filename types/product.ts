export interface ICompetitorProduct {
    _id: string;
    source_name?: string;
    item_code?: string;
    category?: string;
    brand?: string;
    tyre_pattern?: string;
    size?: string;
    runflat?: string;
    year?: number;
    country?: string;
    price?: number;
    set_price?: number;
    source_date?: string;
    url?: string;
    [key: string]: any;
}
