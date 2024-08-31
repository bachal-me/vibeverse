import mongoose, { Schema } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType = "desc", userId } = req.query

    const sortTypeDirection = sortType === "desc" ? -1 : 1
    // INFORMATION: get all videos based on query, sort, pagination

    // IDEAL: count the number of videos in only one call to reduce calls to database

    // TODO: handle sort by query 
    const videos = await Video.aggregate([
        {
            $match: {
                ...(userId && { owner: new mongoose.Types.ObjectId(userId) }),
                ...(query && { title: query, })
            }
        },
        {
            $sort: {
                createdAt: sortTypeDirection
            }
        },
        {
            $skip: (page - 1) * limit
        },
        {
            $limit: parseInt(limit)
        }
    ])

    // TODO: Remove this when we have calculated the number of videos
    const totalVideos = await Video.countDocuments({
        ...(userId && { owner: userId }),
        ...(query && { title: query, })
    })

    const totalPages = Math.ceil(totalVideos / limit)

    if (!videos || videos.length === 0) {
        new ApiError(400, "Failed to fetched videos")
    }

    return res
        .status(200)
        .json(new ApiResponse(200,
            videos, {
            curruntPage: parseInt(page),
            totalPages,
            pageSize: parseInt(limit),
            totalIems: totalVideos
        }, "All videos fetched successfully"))

})

const publishVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body
    const userId = req.user?._id
    // INFORMATION: get video, upload to cloudinary, create video

    if (!title || !description) {
        throw new ApiError(400, "Title or Description is missing")
    }

    const videoFileLocalPath = req.files?.videoFile[0]?.path
    if (!videoFileLocalPath) {
        throw new ApiError(400, "Video file is missing")
    }

    const thumbnailLocalPath = req.files?.thumbnail[0]?.path
    if (!thumbnailLocalPath) {
        throw new ApiError(400, "thumbnail is missing")
    }

    const videoFile = await uploadOnCloudinary(videoFileLocalPath)

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    if (!videoFile) {
        throw new ApiError(500, "Failed to upload Video")
    }
    if (!thumbnail) {
        throw new ApiError(500, "Failed to upload Video")
    }

    const Createdvideo = await Video.create({
        title,
        description,
        videoFile: videoFile.url,
        thumbnail: thumbnail.url,
        duration: videoFile.duration,
        owner: userId
    })
    if (!Createdvideo) {
        throw new ApiError(500, "Something went wrong while creating the video")
    }


    return res
        .status(200)
        .json(new ApiResponse(200, Createdvideo, "Video uploaded successfully"))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    const userId = req.user?._id
    // INFORMATION: get video by id

    // IDEA: Add viewed by in video model to know who viewed my video
    if (!videoId?.trim()) {
        throw new ApiError(400, "Video id is required")
    }

    // TODO: Merge watchHistory increment and video views count in one request
    await User.findByIdAndUpdate(userId, { $push: { watchHistory: videoId } }, { new: true })

    const videoViews = await User.aggregate([
        {
            $unwind: "$watchHistory"
        },
        {
            $match: {
                watchHistory: new mongoose.Types.ObjectId(videoId)
            }
        },
        {
            $count: "viewsCount"
        }
    ])

    const video = await Video.findByIdAndUpdate(videoId, { $set: { views: videoViews[0].viewsCount } }, { new: true })

    if (!video) {
        throw new ApiError(400, "Video not found in Database")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video found successfully"))
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    // TODO: Update details Separately
    const { title, description } = req.body

    const thumbnailLocalPath = req?.file?.path

    if (!videoId) {
        throw new ApiError(400, "Video id is required")
    }

    // if (!title || !description || !thumbnailLocalPath) {
    //     throw new ApiError(400, "Title, description and thumbnail are required")
    // }

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    const video = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                ...(title && { title: title, }),
                ...(description && { description: description, }),
                ...(thumbnail.url && { thumbnail: thumbnail.url, })
            }
        },
        { new: true })

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video updated successfully"))

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video

    if (!videoId) {
        throw new ApiError(400, "Video id is required")
    }

    const video = await Video.findByIdAndDelete(videoId)

    if (!video) {
        throw new ApiError(500, "Error occured while deleting video")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video deleted successfully"))
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!videoId) {
        throw new ApiError(400, "Video id is required")
    }

    const { publishStatus } = req.body

    const video = await Video.findByIdAndUpdate(videoId, { $set: { isPublished: publishStatus } }, { new: true })

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Publish status toggled"))
})

export {
    getAllVideos,
    publishVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
