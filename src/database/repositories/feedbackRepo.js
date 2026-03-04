const supabase = require('../supabaseClient');

async function saveFeedback(data) {
    try {
        const { data: feedback, error } = await supabase
            .from('feedbacks')
            .insert([{
                order_id: data.orderId,
                user_id: data.userId,
                username: data.username,
                rating: data.rating,
                comment: data.comment,
                is_anonymous: data.isAnonymous,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;
        return feedback;
    } catch (error) {
        console.error('Error saving feedback:', error.message);
        return null;
    }
}

async function getApprovedFeedbacks(limit = 10) {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching approved feedbacks:', error.message);
        return [];
    }
}

async function updateFeedbackStatus(feedbackId, status) {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .update({ status: status })
            .eq('id', feedbackId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error updating feedback status:', error.message);
        return null;
    }
}

async function hasUserAlreadyFeedbacked(orderId) {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .select('id')
            .eq('order_id', orderId)
            .maybeSingle();

        if (error) throw error;
        return !!data;
    } catch (error) {
        console.error('Error checking existing feedback:', error.message);
        return false;
    }
}

module.exports = {
    saveFeedback,
    getApprovedFeedbacks,
    updateFeedbackStatus,
    hasUserAlreadyFeedbacked
};
